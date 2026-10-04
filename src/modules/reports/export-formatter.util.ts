import { randomUUID } from 'crypto';

export type ExportFormat = 'csv' | 'json';

export interface TraceableExport {
  exportId: string;
  format: ExportFormat;
  recordCount: number;
  generatedAt: string;
  content: string;
}

/**
 * Formats a set of records as CSV or JSON for support/admin data export,
 * tagging the output with a traceable export id and timestamp.
 */
export function formatExport(
  records: Record<string, unknown>[],
  format: ExportFormat,
): TraceableExport {
  const content =
    format === 'json' ? JSON.stringify(records, null, 2) : toCsv(records);

  return {
    exportId: randomUUID(),
    format,
    recordCount: records.length,
    generatedAt: new Date().toISOString(),
    content,
  };
}

function toCsv(records: Record<string, unknown>[]): string {
  if (records.length === 0) return '';
  const headers = Object.keys(records[0]);
  const rows = records.map((row) =>
    headers.map((h) => JSON.stringify(row[h] ?? '')).join(','),
  );
  return [headers.join(','), ...rows].join('\n');
}
