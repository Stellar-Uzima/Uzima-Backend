import ImportJob from '../models/importJob.js';
import { processImport, buildErrorReport } from '../services/csvImportService.js';
import ApiResponse from '../utils/apiResponse.js';
import { wrapAsync } from '../utils/errors.js';

/**
 * Upload and process a CSV file for record import.
 * POST /api/import/csv
 */
export const uploadCsv = wrapAsync(async (req, res) => {
  if (!req.file) {
    return ApiResponse.error(res, 'No file uploaded', 400);
  }

  const { originalname, size, mimetype, buffer } = req.file;

  if (mimetype !== 'text/csv' && !originalname.endsWith('.csv')) {
    return ApiResponse.error(res, 'Only CSV files are accepted', 400);
  }

  if (size === 0) {
    return ApiResponse.error(res, 'Uploaded file is empty', 400);
  }

  const job = await ImportJob.create({
    fileName: originalname,
    fileSize: size,
    mimeType: mimetype,
    status: 'pending',
    createdBy: req.user._id,
  });

  // Process asynchronously so the client gets an immediate response
  processImport(job._id, buffer, req.user._id).catch(() => {
    // Errors are persisted on the job document; nothing else to do here
  });

  return ApiResponse.success(
    res,
    {
      jobId: job._id,
      status: job.status,
      fileName: job.fileName,
    },
    'Import job created. Processing has started.',
    202
  );
});

/**
 * Get the current status and progress of an import job.
 * GET /api/import/:id/status
 */
export const getImportStatus = wrapAsync(async (req, res) => {
  const job = await ImportJob.findOne({
    _id: req.params.id,
    createdBy: req.user._id,
  });

  if (!job) {
    return ApiResponse.error(res, 'Import job not found', 404);
  }

  const progress = job.totalRows > 0 ? Math.round((job.processedRows / job.totalRows) * 100) : 0;

  return ApiResponse.success(res, {
    jobId: job._id,
    status: job.status,
    fileName: job.fileName,
    totalRows: job.totalRows,
    processedRows: job.processedRows,
    successCount: job.successCount,
    errorCount: job.errorCount,
    progress,
    failureReason: job.failureReason,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    createdAt: job.createdAt,
  });
});

/**
 * Download the error report for a completed/failed import job.
 * GET /api/import/:id/errors
 */
export const downloadErrorReport = wrapAsync(async (req, res) => {
  const job = await ImportJob.findOne({
    _id: req.params.id,
    createdBy: req.user._id,
  });

  if (!job) {
    return ApiResponse.error(res, 'Import job not found', 404);
  }

  if (!job.rowErrors || job.rowErrors.length === 0) {
    return ApiResponse.error(res, 'No errors to report for this import', 400);
  }

  const report = buildErrorReport(job);

  res.setHeader('Content-Type', report.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${report.fileName}"`);
  return res.send(report.content);
});

/**
 * List import jobs for the authenticated user.
 * GET /api/import/jobs
 */
export const listImportJobs = wrapAsync(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const skip = (page - 1) * limit;

  const filter = { createdBy: req.user._id };

  if (req.query.status) {
    filter.status = req.query.status;
  }

  const [jobs, total] = await Promise.all([
    ImportJob.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-rowErrors'),
    ImportJob.countDocuments(filter),
  ]);

  return ApiResponse.success(res, {
    jobs,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * Cancel a pending or processing import job.
 * POST /api/import/:id/cancel
 */
export const cancelImport = wrapAsync(async (req, res) => {
  const job = await ImportJob.findOne({
    _id: req.params.id,
    createdBy: req.user._id,
  });

  if (!job) {
    return ApiResponse.error(res, 'Import job not found', 404);
  }

  if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
    return ApiResponse.error(res, `Cannot cancel a job with status "${job.status}"`, 400);
  }

  job.status = 'cancelled';
  job.failureReason = 'Cancelled by user';
  job.completedAt = new Date();
  await job.save();

  return ApiResponse.success(res, { jobId: job._id, status: job.status });
});
