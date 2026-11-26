import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * 429 Too Many Requests.
 *
 * `@nestjs/common` has no exception for this status, so code that imported
 * one from there got `undefined` and crashed with a TypeError at the moment it
 * tried to throw. Resend and password-reset throttling need a real 429 so a
 * client can tell "slow down" apart from "bad request".
 */
export class TooManyRequestsException extends HttpException {
  constructor(message = 'Too many requests') {
    super(
      { statusCode: HttpStatus.TOO_MANY_REQUESTS, message, error: 'Too Many Requests' },
      HttpStatus.TOO_MANY_REQUESTS
    );
  }
}
