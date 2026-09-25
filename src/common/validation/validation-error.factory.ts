import { ValidationError } from 'class-validator';
import { ApiErrorDetails } from '../errors/api-error.exception';

/**
 * Flattens class-validator's nested {@link ValidationError} tree into the flat
 * `details` map used by the error envelope (#1292).
 *
 * Nested objects/arrays are reported under their full dotted path
 * (`items.0.dailyLimit`) rather than being collapsed into one opaque message,
 * so a client can highlight the exact input field that was rejected.
 */
export function flattenValidationErrors(errors: ValidationError[]): ApiErrorDetails {
  const details: ApiErrorDetails = {};

  const walk = (nodes: ValidationError[], prefix: string): void => {
    for (const node of nodes) {
      const path = prefix ? `${prefix}.${node.property}` : node.property;
      const messages = collectMessages(node);

      if (messages.length > 0) {
        const existing = details[path];
        if (existing === undefined) {
          details[path] = messages;
        } else {
          // A nested parent reports its own constraint as a string while the
          // child reports an array; normalise to a single array.
          details[path] = [
            ...(Array.isArray(existing) ? existing : [String(existing)]),
            ...messages,
          ];
        }
      }

      if (node.children?.length) {
        walk(node.children, path);
      }
    }
  };

  walk(errors, '');
  return details;
}

function collectMessages(node: ValidationError): string[] {
  const own = (node.constraints ? Object.values(node.constraints) : []).filter(
    (value): value is string => typeof value === 'string',
  );

  const nested = (node.children ?? []).flatMap((child) => collectMessages(child));

  return [...new Set([...own, ...nested])];
}

/**
 * Builds the `details` object for a validation failure, splitting it into the
 * flat field map and a per-field count so clients can render a summary.
 */
export function buildValidationDetails(errors: ValidationError[]): ApiErrorDetails & {
  fields: ApiErrorDetails;
  errorCount: number;
} {
  const fields = flattenValidationErrors(errors);
  return {
    fields,
    errorCount: Object.values(fields).reduce(
      (total, value) => total + (Array.isArray(value) ? value.length : 1),
      0,
    ),
  };
}
