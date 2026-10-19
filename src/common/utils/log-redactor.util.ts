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
  'cookie',
  'session',
  'privateKey',
  'key',
];

const SENSITIVE_TEXT_PATTERN =
  /((?:password|token|authorization|secret|api[_-]?key|private[_-]?key|key|otp|ssn|credit[_-]?card|cookie|session)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s&,;]+)/gi;

export function redactSensitiveText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(SENSITIVE_TEXT_PATTERN, '$1[REDACTED]');
}

export function redactSensitiveFields<T extends Record<string, unknown>>(
  payload: T,
): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload.map((value) => {
      if (typeof value === 'string') {
        return redactSensitiveText(value);
      }
      if (value && typeof value === 'object') {
        return redactSensitiveFields(value as Record<string, unknown>);
      }
      return value;
    }) as unknown as Record<string, unknown>;
  }

  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    const isSensitive = SENSITIVE_KEYS.some((sensitiveKey) =>
      key.toLowerCase().includes(sensitiveKey.toLowerCase()),
    );

    if (isSensitive) {
      redacted[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      redacted[key] = redactSensitiveFields(value as Record<string, unknown>);
    } else if (typeof value === 'string') {
      redacted[key] = redactSensitiveText(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}
