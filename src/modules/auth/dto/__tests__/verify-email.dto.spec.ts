import { randomBytes } from 'crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VerifyEmailDto } from '../verify-email.dto';

const check = (token: unknown) => validate(plainToInstance(VerifyEmailDto, { token }));

describe('VerifyEmailDto token (#1467)', () => {
  it('accepts a token in the exact format EmailVerificationService issues', async () => {
    // createForUser() issues crypto.randomBytes(32).toString('hex').
    expect(await check(randomBytes(32).toString('hex'))).toHaveLength(0);
  });

  it('rejects a UUID, which is not a format this service ever issues', async () => {
    const errors = await check('123e4567-e89b-12d3-a456-426614174000');

    expect(errors.map((e) => e.property)).toEqual(['token']);
  });

  it.each([
    ['too short', 'abc123'],
    ['too long', 'a'.repeat(65)],
    ['not hex', 'g'.repeat(64)],
    ['upper case', 'A'.repeat(64)],
    ['empty', ''],
  ])('rejects a token that is %s', async (_label, token) => {
    expect((await check(token)).length).toBeGreaterThan(0);
  });

  it('rejects a missing or non-string token without throwing', async () => {
    expect((await check(undefined)).length).toBeGreaterThan(0);
    expect((await check(12345)).length).toBeGreaterThan(0);
  });
});
