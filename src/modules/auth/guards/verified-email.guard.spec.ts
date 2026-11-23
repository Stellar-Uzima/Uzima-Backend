import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { EMAIL_NOT_VERIFIED_CODE, VerifiedEmailGuard } from './verified-email.guard';

const contextFor = (user?: Record<string, unknown>): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext;

describe('VerifiedEmailGuard (#1467)', () => {
  const makeGuard = (findById: jest.Mock) => new VerifiedEmailGuard({ findById } as never);

  it('lets a verified account through', async () => {
    const findById = jest.fn().mockResolvedValue({ id: 'u1', isVerified: true });

    await expect(makeGuard(findById).canActivate(contextFor({ userId: 'u1' }))).resolves.toBe(true);
    expect(findById).toHaveBeenCalledWith('u1');
  });

  it('refuses an unverified account with a 403 and a machine-readable code', async () => {
    const findById = jest.fn().mockResolvedValue({ id: 'u1', isVerified: false });

    const attempt = makeGuard(findById).canActivate(contextFor({ userId: 'u1' }));

    await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
    await expect(attempt).rejects.toMatchObject({
      response: expect.objectContaining({ code: EMAIL_NOT_VERIFIED_CODE }),
    });
  });

  it('reads the current flag from the database, not from the token', async () => {
    // The token was minted while the account was unverified, then the user
    // verified. The guard must follow the database, so access starts working.
    const findById = jest.fn().mockResolvedValue({ id: 'u1', isVerified: true });

    await expect(
      makeGuard(findById).canActivate(contextFor({ userId: 'u1', isVerified: false })),
    ).resolves.toBe(true);
  });

  it('accepts the legacy sub claim as the user id', async () => {
    const findById = jest.fn().mockResolvedValue({ id: 'u2', isVerified: true });

    await makeGuard(findById).canActivate(contextFor({ sub: 'u2' }));

    expect(findById).toHaveBeenCalledWith('u2');
  });

  it('rejects a request that has no authenticated user', async () => {
    const findById = jest.fn();

    await expect(makeGuard(findById).canActivate(contextFor(undefined))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(findById).not.toHaveBeenCalled();
  });

  it('rejects a token whose user no longer exists', async () => {
    const findById = jest.fn().mockRejectedValue(new Error('User not found'));

    await expect(
      makeGuard(findById).canActivate(contextFor({ userId: 'gone' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not hide a database failure as an auth failure', async () => {
    const findById = jest.fn().mockRejectedValue(new Error('connection lost'));

    await expect(makeGuard(findById).canActivate(contextFor({ userId: 'u1' }))).rejects.toThrow(
      'connection lost',
    );
  });
});
