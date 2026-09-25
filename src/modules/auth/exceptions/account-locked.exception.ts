import { HttpException } from '@nestjs/common';

/** HTTP 423 Locked — account temporarily locked after failed login attempts */
const HTTP_LOCKED = 423;

export class AccountLockedException extends HttpException {
  constructor(lockedUntil: Date, remainingAttempts: number = 0) {
    const seconds = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000));

    super(
      {
        statusCode: HTTP_LOCKED,
        code: 'ACCOUNT_LOCKED',
        message: 'Account is temporarily locked due to too many failed login attempts',
        lockedUntil: lockedUntil.toISOString(),
        // Telling the caller when it unlocks is the difference between "try
        // again later" and a support ticket. The remaining-attempts count is
        // only meaningful for an already-locked account, so it is 0 here.
        retryAfterSeconds: seconds,
        remainingAttempts,
      },
      HTTP_LOCKED,
    );

    // Lets a client build a "try again in N" countdown without parsing the body.
    this.name = 'AccountLockedException';
  }
}
