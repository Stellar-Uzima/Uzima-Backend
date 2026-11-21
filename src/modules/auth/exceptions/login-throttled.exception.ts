import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * HTTP 429 raised when too many failed login attempts have been seen for an
 * identity (email address) or a client (IP address).
 *
 * The body is deliberately identical whether or not the identity belongs to a
 * registered account. A different message, status or timing for "known" and
 * "unknown" addresses would turn the throttle into an account-enumeration
 * oracle, so nothing here depends on the user lookup.
 */
export class LoginThrottledException extends HttpException {
  /** Whole seconds the caller should wait before trying again. Always >= 1. */
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    const seconds = Math.max(1, Math.ceil(retryAfterSeconds));

    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: 'LOGIN_THROTTLED',
        message: 'Too many login attempts. Please try again later.',
        retryAfterSeconds: seconds,
      },
      HttpStatus.TOO_MANY_REQUESTS
    );

    this.name = 'LoginThrottledException';
    this.retryAfterSeconds = seconds;
  }
}
