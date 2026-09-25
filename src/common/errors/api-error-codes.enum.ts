/**
 * Machine-readable error codes returned by the API (#1292).
 *
 * The `message` field is for humans and may be reworded at any time; the `code`
 * is the stable contract a client should branch on. Codes are namespaced by
 * subsystem so a log line or a support ticket points straight at the cause.
 */
export enum ApiErrorCode {
  // --- Generic / validation ---
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  BAD_REQUEST = 'BAD_REQUEST',
  UNKNOWN_FIELD = 'UNKNOWN_FIELD',
  MALFORMED_JSON = 'MALFORMED_JSON',

  // --- Auth ---
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_REVOKED = 'TOKEN_REVOKED',
  EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  ACCOUNT_INACTIVE = 'ACCOUNT_INACTIVE',
  INSUFFICIENT_ROLE = 'INSUFFICIENT_ROLE',
  INSUFFICIENT_PERMISSION = 'INSUFFICIENT_PERMISSION',

  // --- Resources ---
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  GONE = 'GONE',

  // --- Users ---
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  EMAIL_ALREADY_REGISTERED = 'EMAIL_ALREADY_REGISTERED',
  PHONE_ALREADY_IN_USE = 'PHONE_ALREADY_IN_USE',
  INVALID_SEARCH_FILTER = 'INVALID_SEARCH_FILTER',

  // --- Account status (#1291) ---
  ACCOUNT_ALREADY_INACTIVE = 'ACCOUNT_ALREADY_INACTIVE',
  ACCOUNT_ALREADY_ACTIVE = 'ACCOUNT_ALREADY_ACTIVE',
  CANNOT_DEACTIVATE_SELF = 'CANNOT_DEACTIVATE_SELF',
  CANNOT_DEACTIVATE_LAST_ADMIN = 'CANNOT_DEACTIVATE_LAST_ADMIN',
  REACTIVATION_NOT_PERMITTED = 'REACTIVATION_NOT_PERMITTED',
  CONFIRMATION_REQUIRED = 'CONFIRMATION_REQUIRED',

  // --- Pagination (#1293) ---
  INVALID_PAGE = 'INVALID_PAGE',
  INVALID_LIMIT = 'INVALID_LIMIT',
  INVALID_SORT_FIELD = 'INVALID_SORT_FIELD',

  // --- Throttling / availability ---
  RATE_LIMITED = 'RATE_LIMITED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',

  // --- Catch-all ---
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * Default HTTP status for each code, so a thrown `ApiErrorException` produces
 * the right status without every call site having to pass one.
 */
export const API_ERROR_STATUS: Readonly<Record<ApiErrorCode, number>> = Object.freeze({
  [ApiErrorCode.VALIDATION_FAILED]: 400,
  [ApiErrorCode.BAD_REQUEST]: 400,
  [ApiErrorCode.UNKNOWN_FIELD]: 400,
  [ApiErrorCode.MALFORMED_JSON]: 400,

  [ApiErrorCode.UNAUTHENTICATED]: 401,
  [ApiErrorCode.INVALID_CREDENTIALS]: 401,
  [ApiErrorCode.TOKEN_EXPIRED]: 401,
  [ApiErrorCode.TOKEN_REVOKED]: 401,
  [ApiErrorCode.EMAIL_NOT_VERIFIED]: 403,
  [ApiErrorCode.ACCOUNT_LOCKED]: 423,
  [ApiErrorCode.ACCOUNT_INACTIVE]: 403,
  [ApiErrorCode.INSUFFICIENT_ROLE]: 403,
  [ApiErrorCode.INSUFFICIENT_PERMISSION]: 403,

  [ApiErrorCode.NOT_FOUND]: 404,
  [ApiErrorCode.CONFLICT]: 409,
  [ApiErrorCode.ALREADY_EXISTS]: 409,
  [ApiErrorCode.GONE]: 410,

  [ApiErrorCode.USER_NOT_FOUND]: 404,
  [ApiErrorCode.EMAIL_ALREADY_REGISTERED]: 409,
  [ApiErrorCode.PHONE_ALREADY_IN_USE]: 409,
  [ApiErrorCode.INVALID_SEARCH_FILTER]: 400,

  [ApiErrorCode.ACCOUNT_ALREADY_INACTIVE]: 409,
  [ApiErrorCode.ACCOUNT_ALREADY_ACTIVE]: 409,
  [ApiErrorCode.CANNOT_DEACTIVATE_SELF]: 400,
  [ApiErrorCode.CANNOT_DEACTIVATE_LAST_ADMIN]: 409,
  [ApiErrorCode.REACTIVATION_NOT_PERMITTED]: 409,
  [ApiErrorCode.CONFIRMATION_REQUIRED]: 400,

  [ApiErrorCode.INVALID_PAGE]: 400,
  [ApiErrorCode.INVALID_LIMIT]: 400,
  [ApiErrorCode.INVALID_SORT_FIELD]: 400,

  [ApiErrorCode.RATE_LIMITED]: 429,
  [ApiErrorCode.SERVICE_UNAVAILABLE]: 503,

  [ApiErrorCode.INTERNAL_ERROR]: 500,
});
