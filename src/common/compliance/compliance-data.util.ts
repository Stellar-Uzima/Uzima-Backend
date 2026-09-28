/**
 * Tax/compliance data handling helpers (#1341).
 * Centralizes retention periods and masking rules for sensitive
 * financial-reporting fields so they aren't reimplemented per-module.
 */

/** Days a tax/compliance record must be retained before it may be purged. */
export const COMPLIANCE_RETENTION_DAYS = {
  TAX_RECORD: 2555, // 7 years
  TRANSACTION_REPORT: 1825, // 5 years
} as const;

export interface ComplianceRecord {
  taxId?: string;
  reportedAmount: number;
  jurisdiction: string;
}

/** Masks all but the last 4 characters of a sensitive identifier for display/logging. */
export function maskSensitiveId(value: string): string {
  if (!value || value.length <= 4) return '****';
  return '*'.repeat(value.length - 4) + value.slice(-4);
}

/** Returns true once a compliance record has passed its retention window. */
export function isPastRetention(recordedAt: Date, retentionDays: number): boolean {
  const cutoff = new Date(recordedAt.getTime() + retentionDays * 24 * 60 * 60 * 1000);
  return Date.now() > cutoff.getTime();
}

export function toMaskedComplianceView(record: ComplianceRecord) {
  return {
    ...record,
    taxId: record.taxId ? maskSensitiveId(record.taxId) : undefined,
  };
}
