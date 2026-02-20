/* eslint-disable prettier/prettier */
import mongoose from 'mongoose';
import ImportJob from '../models/importJob.js';
import Record from '../models/Record.js';
import {
  parseCsvBuffer,
  validateAllRows,
  processImport,
  buildErrorReport,
} from '../services/csvImportService.js';
import { validateRow } from '../validations/importValidators.js';

// Helper to create a CSV buffer from rows
function makeCsv(headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(row.map(v => (typeof v === 'string' && v.includes(',') ? `"${v}"` : v)).join(','));
  }
  return Buffer.from(lines.join('\n'), 'utf-8');
}

describe('CSV Import - Validators', () => {
  test('validateRow accepts a valid row', () => {
    const result = validateRow({
      patientName: 'Jane Doe',
      diagnosis: 'Flu',
      treatment: 'Rest and fluids',
    });
    expect(result.success).toBe(true);
    expect(result.data.patientName).toBe('Jane Doe');
  });

  test('validateRow rejects missing required fields', () => {
    const result = validateRow({ patientName: '' });
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    const fields = result.errors.map(e => e.field);
    expect(fields).toContain('patientName');
  });

  test('validateRow rejects short patient name', () => {
    const result = validateRow({
      patientName: 'A',
      diagnosis: 'Cold',
      treatment: 'Meds',
    });
    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.field === 'patientName')).toBe(true);
  });

  test('validateRow strips unknown fields', () => {
    const result = validateRow({
      patientName: 'John Smith',
      diagnosis: 'Headache',
      treatment: 'Ibuprofen',
      unknownField: 'should be removed',
    });
    expect(result.success).toBe(true);
    expect(result.data.unknownField).toBeUndefined();
  });

  test('validateRow accepts optional history and date', () => {
    const result = validateRow({
      patientName: 'Alice',
      diagnosis: 'Migraine',
      treatment: 'Sumatriptan',
      history: 'Previous episodes in 2023',
      date: '2025-01-15',
    });
    expect(result.success).toBe(true);
    expect(result.data.history).toBe('Previous episodes in 2023');
  });
});

describe('CSV Import - Parser', () => {
  test('parseCsvBuffer parses valid CSV', () => {
    const buf = makeCsv(
      ['patientName', 'diagnosis', 'treatment'],
      [
        ['Jane Doe', 'Flu', 'Rest'],
        ['John Smith', 'Cold', 'Meds'],
      ]
    );
    const { rows, parseErrors } = parseCsvBuffer(buf);
    expect(rows).toHaveLength(2);
    expect(rows[0].patientName).toBe('Jane Doe');
    expect(parseErrors).toHaveLength(0);
  });

  test('parseCsvBuffer returns empty rows for empty file', () => {
    const buf = Buffer.from('', 'utf-8');
    const { rows } = parseCsvBuffer(buf);
    expect(rows).toHaveLength(0);
  });

  test('parseCsvBuffer handles headers only', () => {
    const buf = Buffer.from('patientName,diagnosis,treatment\n', 'utf-8');
    const { rows } = parseCsvBuffer(buf);
    expect(rows).toHaveLength(0);
  });

  test('parseCsvBuffer trims whitespace from headers and values', () => {
    const buf = Buffer.from(
      ' patientName , diagnosis , treatment \n Alice , Flu , Rest \n',
      'utf-8'
    );
    const { rows } = parseCsvBuffer(buf);
    expect(rows).toHaveLength(1);
    expect(rows[0].patientName).toBe('Alice');
    expect(rows[0].diagnosis).toBe('Flu');
  });
});

describe('CSV Import - validateAllRows', () => {
  test('separates valid and invalid rows', () => {
    const rows = [
      { patientName: 'Jane', diagnosis: 'Flu', treatment: 'Rest' },
      { patientName: '', diagnosis: '', treatment: '' },
      { patientName: 'Bob', diagnosis: 'Cold', treatment: 'Meds' },
    ];
    const { validRows, rowErrors } = validateAllRows(rows);
    expect(validRows).toHaveLength(2);
    expect(rowErrors).toHaveLength(1);
    expect(rowErrors[0].row).toBe(2);
  });

  test('returns all valid when no errors', () => {
    const rows = [
      { patientName: 'Jane', diagnosis: 'Flu', treatment: 'Rest' },
      { patientName: 'Bob', diagnosis: 'Cold', treatment: 'Meds' },
    ];
    const { validRows, rowErrors } = validateAllRows(rows);
    expect(validRows).toHaveLength(2);
    expect(rowErrors).toHaveLength(0);
  });

  test('returns all invalid when every row fails', () => {
    const rows = [
      { patientName: '', diagnosis: '', treatment: '' },
      { patientName: 'A', diagnosis: '', treatment: '' },
    ];
    const { validRows, rowErrors } = validateAllRows(rows);
    expect(validRows).toHaveLength(0);
    expect(rowErrors).toHaveLength(2);
  });
});

describe('CSV Import - processImport (integration)', () => {
  let userId;

  beforeEach(async () => {
    userId = new mongoose.Types.ObjectId();
  });

  test('successfully imports valid CSV rows within a transaction', async () => {
    const buf = makeCsv(
      ['patientName', 'diagnosis', 'treatment'],
      [
        ['Jane Doe', 'Flu', 'Rest and fluids'],
        ['John Smith', 'Cold', 'Medication'],
      ]
    );

    const job = await ImportJob.create({
      fileName: 'test.csv',
      fileSize: buf.length,
      createdBy: userId,
    });

    const result = await processImport(job._id, buf, userId);
    expect(result.status).toBe('completed');
    expect(result.successCount).toBe(2);
    expect(result.totalRows).toBe(2);
    expect(result.errorCount).toBe(0);

    const records = await Record.find({ createdBy: userId });
    expect(records).toHaveLength(2);
  });

  test('fails entire import when any row is invalid (all-or-nothing)', async () => {
    const buf = makeCsv(
      ['patientName', 'diagnosis', 'treatment'],
      [
        ['Jane Doe', 'Flu', 'Rest'],
        ['', '', ''],
      ]
    );

    const job = await ImportJob.create({
      fileName: 'bad.csv',
      fileSize: buf.length,
      createdBy: userId,
    });

    const result = await processImport(job._id, buf, userId);
    expect(result.status).toBe('failed');
    expect(result.errorCount).toBe(1);
    expect(result.rowErrors).toHaveLength(1);
    expect(result.rowErrors[0].row).toBe(2);

    const records = await Record.find({ createdBy: userId });
    expect(records).toHaveLength(0);
  });

  test('fails when CSV has no data rows', async () => {
    const buf = Buffer.from('patientName,diagnosis,treatment\n', 'utf-8');

    const job = await ImportJob.create({
      fileName: 'empty.csv',
      fileSize: buf.length,
      createdBy: userId,
    });

    const result = await processImport(job._id, buf, userId);
    expect(result.status).toBe('failed');
    expect(result.failureReason).toContain('no data rows');
  });

  test('fails when all rows are invalid', async () => {
    const buf = makeCsv(
      ['patientName', 'diagnosis', 'treatment'],
      [
        ['', '', ''],
        ['A', '', ''],
      ]
    );

    const job = await ImportJob.create({
      fileName: 'allinvalid.csv',
      fileSize: buf.length,
      createdBy: userId,
    });

    const result = await processImport(job._id, buf, userId);
    expect(result.status).toBe('failed');
    expect(result.failureReason).toContain('failed validation');
  });
});

describe('CSV Import - buildErrorReport', () => {
  test('generates a CSV error report from job errors', () => {
    const fakeJob = {
      _id: 'abc123',
      rowErrors: [
        {
          row: 2,
          data: { patientName: '', diagnosis: '' },
          errors: [
            { field: 'patientName', message: 'Patient name is required' },
            { field: 'diagnosis', message: 'Diagnosis is required' },
          ],
        },
        {
          row: 5,
          data: { patientName: 'A' },
          errors: [{ field: 'patientName', message: 'Patient name must be at least 2 characters' }],
        },
      ],
    };

    const report = buildErrorReport(fakeJob);
    expect(report.fileName).toBe('import-errors-abc123.csv');
    expect(report.mimeType).toBe('text/csv');

    const lines = report.content.split('\n');
    expect(lines[0]).toBe('Row,Field,Message,Original Data');
    expect(lines).toHaveLength(4); // header + 3 error lines
  });

  test('generates report with empty errors array', () => {
    const fakeJob = { _id: 'xyz', rowErrors: [] };
    const report = buildErrorReport(fakeJob);
    const lines = report.content.split('\n');
    expect(lines).toHaveLength(1); // header only
  });
});

describe('CSV Import - ImportJob model', () => {
  test('creates a job with default values', async () => {
    const userId = new mongoose.Types.ObjectId();
    const job = await ImportJob.create({
      fileName: 'test.csv',
      createdBy: userId,
    });

    expect(job.status).toBe('pending');
    expect(job.totalRows).toBe(0);
    expect(job.processedRows).toBe(0);
    expect(job.successCount).toBe(0);
    expect(job.errorCount).toBe(0);
    expect(job.rowErrors).toHaveLength(0);
    expect(job.failureReason).toBeNull();
  });

  test('enforces valid status enum', async () => {
    const userId = new mongoose.Types.ObjectId();
    await expect(
      ImportJob.create({ fileName: 'test.csv', createdBy: userId, status: 'invalid_status' })
    ).rejects.toThrow();
  });

  test('requires fileName', async () => {
    const userId = new mongoose.Types.ObjectId();
    await expect(ImportJob.create({ createdBy: userId })).rejects.toThrow();
  });

  test('requires createdBy', async () => {
    await expect(ImportJob.create({ fileName: 'test.csv' })).rejects.toThrow();
  });
});
