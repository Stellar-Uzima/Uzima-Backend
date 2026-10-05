import { GoneException } from '@nestjs/common';
import { EmailVerificationService, ConsumeOutcome } from './email-verification.service';

const user = { id: 'u1', email: 'a@example.com', firstName: 'Ada' };
const config = { get: (key: string, fallback?: unknown) => (key === 'EMAIL_VERIFICATION_TTL_MS' ? 86_400_000 : fallback) } as never;

function makeService(rows: Array<Record<string, unknown>> = []) {
  const repo = {
    create: jest.fn((partial) => partial),
    save: jest.fn().mockImplementation(async (row) => ({ ...row, id: 'row-1' })),
    findOne: jest.fn().mockImplementation(async () => rows[0] ?? null),
    find: jest.fn().mockResolvedValue(rows.map((_, i) => ({ id: `row-${i}` }))),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    count: jest.fn().mockResolvedValue(rows.length),
  };

  const usersService = { findById: jest.fn().mockResolvedValue(user) };
  const notifications = { sendMultiChannel: jest.fn().mockResolvedValue(undefined) };

  const service = new EmailVerificationService(repo as never, usersService as never, notifications as never, config);

  return { service, repo, usersService, notifications };
}

describe('EmailVerificationService (#1284)', () => {
  describe('token storage', () => {
    it('stores a hash, not the token, so a database read cannot verify an account', async () => {
      const { service, repo } = makeService();

      const issued = await service.createForUser('u1');

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ token: EmailVerificationService.hashToken(issued.token) }),
      );
      expect(repo.save).toHaveBeenCalledWith(
        expect.not.objectContaining({ token: issued.token }),
      );
    });

    it('produces a 256-bit token', async () => {
      const { service } = makeService();

      const issued = await service.createForUser('u1');

      expect(issued.token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('never returns the token to an unauthenticated caller of consume()', async () => {
      const { service, repo } = makeService();
      repo.findOne.mockResolvedValue(null);

      const outcome = await service.consume('whatever');

      expect(outcome.status).toBe('NOT_FOUND');
      expect(JSON.stringify(outcome)).not.toContain('token');
    });
  });

  describe('single use', () => {
    it('accepts a live token exactly once', async () => {
      const record = { token: EmailVerificationService.hashToken('tok'), consumedAt: null, expiresAt: new Date(Date.now() + 60_000), user };
      const { service, repo } = makeService([record]);
      repo.findOne.mockResolvedValue(record);

      const outcome = await service.consume('tok');

      expect(outcome.status).toBe('OK');
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ consumedAt: expect.any(Date) }),
      );
    });

    it('reports a replay distinctly instead of a generic failure', async () => {
      const record = { token: EmailVerificationService.hashToken('tok'), consumedAt: new Date(), expiresAt: new Date(Date.now() + 60_000), user };
      const { service, repo } = makeService();
      repo.findOne.mockResolvedValue(record);

      const outcome = await service.consume('tok');

      expect(outcome.status).toBe('ALREADY_USED');
    });

    it('reports an expired token distinctly so the client can show 410, not 400', async () => {
      const record = { token: EmailVerificationService.hashToken('tok'), consumedAt: null, expiresAt: new Date(Date.now() - 1_000), user };
      const { service, repo } = makeService();
      repo.findOne.mockResolvedValue(record);

      const outcome = await service.consume('tok');

      expect(outcome.status).toBe('EXPIRED');
    });

    it('looks the token up by hash, not by plaintext', async () => {
      const { service, repo } = makeService();
      repo.findOne.mockResolvedValue(null);

      await service.consume('plaintext-token');

      expect(repo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { token: EmailVerificationService.hashToken('plaintext-token') },
        }),
      );
    });
  });

  describe('superseding', () => {
    it('invalidates outstanding tokens when a new one is issued', async () => {
      const { service, repo } = makeService([{}, {}]);

      const issued = await service.createForUser('u1');

      expect(issued.supersededCount).toBe(2);
      expect(repo.update).toHaveBeenCalledWith(
        ['row-0', 'row-1'],
        { consumedAt: expect.any(Date) },
      );
    });

    it('expires rather than deletes, preserving the attempt trail', async () => {
      const { service, repo } = makeService([{}]);

      await service.createForUser('u1');

      expect(repo.remove).toBeUndefined();
      expect(repo.update).toHaveBeenCalled();
    });
  });

  describe('resilience', () => {
    it('still issues the token when the notification send fails', async () => {
      const { service, notifications } = makeService();
      notifications.sendMultiChannel.mockRejectedValue(new Error('smtp down'));

      const issued = await service.createForUser('u1');

      expect(issued.token).toBeDefined();
    });
  });

  describe('assertNotExpired', () => {
    it('throws Gone only for an expired outcome', () => {
      const expired: ConsumeOutcome = { status: 'EXPIRED', record: {} as never };

      expect(() => EmailVerificationService.assertNotExpired(expired)).toThrow(GoneException);
      expect(() =>
        EmailVerificationService.assertNotExpired({ status: 'NOT_FOUND' }),
      ).not.toThrow();
    });
  });
});
