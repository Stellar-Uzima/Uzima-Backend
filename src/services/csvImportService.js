import mongoose from 'mongoose';
import Papa from 'papaparse';
import ImportJob from '../models/importJob.js';
import Record from '../models/Record.js';
import { validateRow } from '../validations/importValidators.js';
import { logInfo, logError } from '../utils/logger.js';

const MAX_ROW_LIMIT = 50000;
const BATCH_SIZE = 500;

/**
 * Parse a CSV buffer into an array of row objects using papaparse.
 * @param {Buffer} buffer - Raw file buffer from multer
 * @returns {{ rows: Object[], parseErrors: string[] }}
 */
function parseCsvBuffer(buffer) {
  const csvString = buffer.toString('utf-8');

  const result = Papa.parse(csvString, {
    header: true,
    skipEmptyLines: true,
    transformHeader: header => header.trim(),
    transform: value => value.trim(),
  });

  const parseErrors = result.errors.map(err => `Row ${err.row ?? '?'}: ${err.message}`);

  return { rows: result.data, parseErrors };
}

/**
 * Validate all parsed rows and separate valid from invalid.
 * @param {Object[]} rows - Parsed CSV rows
 * @returns {{ validRows: Object[], rowErrors: Array<{row: number, data: Object, errors: Array}> }}
 */
function validateAllRows(rows) {
  const validRows = [];
  const rowErrors = [];

  for (let i = 0; i < rows.length; i++) {
    const result = validateRow(rows[i]);

    if (result.success) {
      validRows.push(result.data);
    } else {
      rowErrors.push({
        row: i + 1,
        data: rows[i],
        errors: result.errors,
      });
    }
  }

  return { validRows, rowErrors };
}

/**
 * Process a CSV import: parse, validate, and insert records within a
 * MongoDB transaction. The entire import is rolled back if any insert fails.
 *
 * @param {string} jobId - The ImportJob document _id
 * @param {Buffer} fileBuffer - Raw CSV file buffer
 * @param {string} userId - The authenticated user's _id
 * @returns {Promise<Object>} The final ImportJob document
 */
async function processImport(jobId, fileBuffer, userId) {
  const job = await ImportJob.findById(jobId);
  if (!job) {
    throw new Error(`Import job ${jobId} not found`);
  }

  job.status = 'validating';
  job.startedAt = new Date();
  await job.save();

  // --- Parse CSV ---
  const { rows, parseErrors } = parseCsvBuffer(fileBuffer);

  if (parseErrors.length > 0) {
    logError('CSV parse errors encountered', { jobId, parseErrors });
  }

  if (rows.length === 0) {
    job.status = 'failed';
    job.failureReason = 'CSV file contains no data rows';
    job.completedAt = new Date();
    await job.save();
    return job;
  }

  if (rows.length > MAX_ROW_LIMIT) {
    job.status = 'failed';
    job.failureReason = `File exceeds maximum row limit of ${MAX_ROW_LIMIT}`;
    job.completedAt = new Date();
    await job.save();
    return job;
  }

  job.totalRows = rows.length;
  await job.save();

  // --- Validate rows ---
  const { validRows, rowErrors } = validateAllRows(rows);

  job.errorCount = rowErrors.length;
  job.rowErrors = rowErrors.slice(0, 1000); // cap stored errors to prevent bloat
  await job.save();

  if (validRows.length === 0) {
    job.status = 'failed';
    job.failureReason = 'All rows failed validation';
    job.completedAt = new Date();
    await job.save();
    return job;
  }

  if (rowErrors.length > 0) {
    // Strict mode: reject entire import if any row is invalid
    job.status = 'failed';
    job.failureReason = `${rowErrors.length} row(s) failed validation. Fix errors and re-upload.`;
    job.completedAt = new Date();
    await job.save();
    return job;
  }

  // --- Insert within a transaction (all-or-nothing) ---
  job.status = 'processing';
  await job.save();

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    let inserted = 0;

    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);

      const documents = batch.map(row => ({
        patientName: row.patientName,
        diagnosis: row.diagnosis,
        treatment: row.treatment,
        history: row.history || '',
        date: row.date || new Date(),
        txHash: new mongoose.Types.ObjectId().toHexString(),
        clientUUID: new mongoose.Types.ObjectId().toHexString(),
        syncTimestamp: new Date(),
        createdBy: userId,
      }));

      await Record.insertMany(documents, { session });
      inserted += batch.length;

      // Periodic progress update (outside the transaction for visibility)
      await ImportJob.updateOne({ _id: jobId }, { processedRows: inserted });
    }

    await session.commitTransaction();

    job.status = 'completed';
    job.successCount = inserted;
    job.processedRows = inserted;
    job.completedAt = new Date();
    await job.save();

    logInfo('CSV import completed successfully', {
      jobId,
      totalRows: rows.length,
      inserted,
    });
  } catch (err) {
    await session.abortTransaction();

    job.status = 'failed';
    job.failureReason = `Transaction failed: ${err.message}`;
    job.completedAt = new Date();
    await job.save();

    logError('CSV import transaction failed, rolled back', {
      jobId,
      error: err.message,
    });
  } finally {
    session.endSession();
  }

  return ImportJob.findById(jobId);
}

/**
 * Build a downloadable error report from an ImportJob.
 * @param {Object} job - ImportJob document
 * @returns {{ fileName: string, content: string, mimeType: string }}
 */
function buildErrorReport(job) {
  const lines = [['Row', 'Field', 'Message', 'Original Data'].join(',')];

  for (const rowErr of job.rowErrors) {
    for (const fieldErr of rowErr.errors) {
      const sanitized = JSON.stringify(rowErr.data || {}).replace(/"/g, '""');
      lines.push([rowErr.row, fieldErr.field, `"${fieldErr.message}"`, `"${sanitized}"`].join(','));
    }
  }

  return {
    fileName: `import-errors-${job._id}.csv`,
    content: lines.join('\n'),
    mimeType: 'text/csv',
  };
}

export {
  parseCsvBuffer,
  validateAllRows,
  processImport,
  buildErrorReport,
  MAX_ROW_LIMIT,
  BATCH_SIZE,
};
