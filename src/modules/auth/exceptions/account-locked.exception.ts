import { HttpException } from '@nestjs/common';

/** HTTP 423 Locked — account temporarily locked after failed login attempts */
const HTTP_LOCKED = 423;

export class AccountLockedException extends HttpException {
  constructor(lockedUntil: Date) {
    super(
      {
        statusCode: HTTP_LOCKED,
        message: 'Account is temporarily locked due to too many failed login attempts',
        lockedUntil: lockedUntil.toISOString(),
      },
      HTTP_LOCKED,
    );
  }
}
