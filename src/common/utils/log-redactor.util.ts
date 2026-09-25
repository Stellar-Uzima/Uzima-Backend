/**
 * Redacts sensitive fields from an object before it is written to logs.
 * Addresses: structured logs must be sanitized to avoid leaking secrets.
 */
const SENSITIVE_KEYS = [
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'secret',
  'apiKey',
  'otp',
  'ssn',
  'creditCard',
];

export function redactSensitiveFields<T extends Record<string, unknown>>(
  payload: T,
): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  const redacted: Record<string, unknown> = Array.isArray(payload) ? [] : {};

  for (const [key, value] of Object.entries(payload)) {
    const isSensitive = SENSITIVE_KEYS.some((sensitiveKey) =>
      key.toLowerCase().includes(sensitiveKey.toLowerCase()),
    );

    if (isSensitive) {
      redacted[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      redacted[key] = redactSensitiveFields(value as Record<string, unknown>);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}
