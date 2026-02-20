/* eslint-disable prettier/prettier */
import { parseCsvBuffer, validateAllRows, buildErrorReport } from '../services/csvImportService.js';
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
