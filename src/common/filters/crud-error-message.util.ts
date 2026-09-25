/**
 * Builds a consistent, user-safe error message for common CRUD failures,
 * differentiating validation errors from business-rule violations and
 * never leaking stack traces or internal implementation details.
 */

export type CrudErrorKind = 'validation' | 'business_rule' | 'not_found' | 'unknown';

export interface CrudErrorMessage {
  kind: CrudErrorKind;
  message: string;
}

export function buildCrudErrorMessage(
  action: 'create' | 'update' | 'delete',
  kind: CrudErrorKind,
  detail?: string,
): CrudErrorMessage {
  const subject = detail?.trim() || 'the requested item';

  switch (kind) {
    case 'validation':
      return {
        kind,
        message: `Could not ${action} ${subject}: one or more fields are invalid.`,
      };
    case 'business_rule':
      return {
        kind,
        message: `Could not ${action} ${subject}: this action isn't allowed right now.`,
      };
    case 'not_found':
      return {
        kind,
        message: `Could not ${action} ${subject}: it no longer exists.`,
      };
    default:
      return {
        kind: 'unknown',
        message: `Could not ${action} ${subject}. Please try again.`,
      };
  }
}
