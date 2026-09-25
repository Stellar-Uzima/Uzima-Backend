import { createHash } from 'crypto';

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'secret',
  'ssn',
  'apiKey',
  'privateKey',
  'stellarSecret',
]);

/**
 * Masks or hashes sensitive values in an admin-action audit payload before
 * it is persisted, so raw secrets never end up in the audit trail.
 */
export function maskSensitiveAuditFields(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const masked: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (SENSITIVE_KEYS.has(key)) {
      masked[key] =
        typeof value === 'string'
          ? `sha256:${createHash('sha256').update(value).digest('hex').slice(0, 16)}`
          : '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      masked[key] = maskSensitiveAuditFields(value as Record<string, unknown>);
    } else {
      masked[key] = value;
    }
  }

  return masked;
}
