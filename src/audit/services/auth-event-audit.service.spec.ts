import {
  AuthEventOutcome,
  AuthEventType,
} from '../../../database/entities/auth-event.entity';
import {
  AuthEventAuditService,
  DEFAULT_AUTH_EVENT_RETENTION_DAYS,
} from './auth-event-audit.service';

/** Minimal in-memory repository for the service under test. */
function makeRepo() {
  const saved: any[] = [];
  return {
    saved,
    create: (partial: any) => partial,
    save: jest.fn(async (row: any) => {
      const now = new Date();
      const stored = { id: `evt-${saved.length + 1}`, createdAt: now, ...row };
      saved.push(stored);
      return stored;
    }),
    findOne: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    find: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
    createQueryBuilder: jest.fn(),
  };
}

function buildService(retentionDays?: number) {
  const repo = makeRepo();
  const config = {
    get: jest.fn().mockImplementation((key: string) =>
      key === 'AUTH_EVENT_RETENTION_DAYS' ? retentionDays : undefined,
    ),
  };

  return { service: new AuthEventAuditService(repo as any, config as any), repo };
}

describe('AuthEventAuditService (#1289)', () => {
  it('persists a login success with a computed retention date', async () => {
    const { service, repo } = buildService();

    const event = await service.record({
      eventType: AuthEventType.LOGIN_SUCCESS,
      userId: 'user-1',
      userEmail: 'Amina@Example.com',
    });

    expect(event?.eventType).toBe(AuthEventType.LOGIN_SUCCESS);
    expect(event?.outcome).toBe(AuthEventOutcome.SUCCESS);

    const row = repo.saved[0];
    expect(row.userEmail).toBe('amina@example.com');
    expect(row.retentionExpiresAt).toBeInstanceOf(Date);
    expect(
      (row.retentionExpiresAt.getTime() - Date.now()) / 86_400_000,
    ).toBeGreaterThan(DEFAULT_AUTH_EVENT_RETENTION_DAYS - 1);
  });

  it('records a failure with its reason', async () => {
    const { service, repo } = buildService();

    await service.recordFailure({
      eventType: AuthEventType.LOGIN_FAILURE,
      userId: 'user-1',
      reason: 'invalid_credentials',
    });

    expect(repo.saved[0].outcome).toBe(AuthEventOutcome.FAILURE);
    expect(repo.saved[0].reason).toBe('invalid_credentials');
  });

  it('records a denial distinctly from a failure', async () => {
    const { service, repo } = buildService();

    await service.recordDenied({
      eventType: AuthEventType.LOGIN_FAILURE,
      userId: 'user-1',
      reason: 'account_locked',
    });

    expect(repo.saved[0].outcome).toBe(AuthEventOutcome.DENIED);
  });

  it('records an unidentified attempt without a userId', async () => {
    const { service, repo } = buildService();

    await service.record({
      eventType: AuthEventType.LOGIN_FAILURE,
      outcome: AuthEventOutcome.FAILURE,
      reason: 'invalid_credentials',
      userEmail: 'unknown@example.com',
    });

    expect(repo.saved[0].userId).toBeNull();
  });

  it('never persists secrets from the metadata blob', async () => {
    const { service, repo } = buildService();

    await service.record({
      eventType: AuthEventType.LOGIN_SUCCESS,
      userId: 'user-1',
      metadata: {
        password: 'hunter2',
        totpCode: '123456',
        nested: { refreshToken: 'abc', harmless: 'keep-me' },
        list: [{ secret: 'shh' }],
      },
    });

    const metadata = repo.saved[0].metadata;
    expect(metadata.password).toBe('[redacted]');
    expect(metadata.totpCode).toBe('[redacted]');
    expect(metadata.nested.refreshToken).toBe('[redacted]');
    expect(metadata.nested.harmless).toBe('keep-me');
    expect(metadata.list[0].secret).toBe('[redacted]');
  });

  it('swallows persistence errors so a login never becomes a 500', async () => {
    const { service, repo } = buildService();
    repo.save.mockRejectedValueOnce(new Error('db down'));

    await expect(
      service.record({ eventType: AuthEventType.LOGIN_SUCCESS, userId: 'user-1' }),
    ).resolves.toBeNull();
  });

  it('honours a configured retention window', async () => {
    const { service } = buildService(30);
    expect(service.configuredRetentionDays).toBe(30);
  });

  it('falls back to the default retention window', async () => {
    const { service } = buildService(undefined);
    expect(service.configuredRetentionDays).toBe(DEFAULT_AUTH_EVENT_RETENTION_DAYS);
  });

  it('purges only rows past their retention date', async () => {
    const { service, repo } = buildService();
    repo.find.mockResolvedValueOnce([{ id: 'evt-1' }, { id: 'evt-2' }]);

    const result = await service.purgeExpired();

    expect(result.deletedCount).toBe(2);
    expect(repo.delete).toHaveBeenCalledWith(['evt-1', 'evt-2']);
  });

  it('is a no-op when nothing has expired', async () => {
    const { service, repo } = buildService();
    repo.find.mockResolvedValueOnce([]);

    const result = await service.purgeExpired();

    expect(result.deletedCount).toBe(0);
    expect(repo.delete).not.toHaveBeenCalled();
  });
});
