import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
jest.mock('../../entities/user-status-log.entity', () => ({
  UserStatusLog: class UserStatusLog {},
}));

jest.mock('../../database/entities/auth-event.entity', () => ({
  AuthEventLog: class AuthEventLog {},
}));
import { AuthEventLog } from '../../database/entities/auth-event.entity';
import { UserStatusLog } from '../../entities/user-status-log.entity';
import { RetentionJobRun } from './entities/retention-job-run.entity';
import { RetentionLegalHold } from './entities/retention-legal-hold.entity';
import { RetentionService } from './retention.service';

describe('RetentionService', () => {
  let service: RetentionService;

  const statusLogs = {
    create: jest.fn(),
    save: jest.fn(),
  };
  const authEventLogs = {};
  const legalHolds = {};
  const jobRuns = {
    create: jest.fn(),
    save: jest.fn(),
  };
  const config = { get: jest.fn() };
  const dataSource = { query: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    jobRuns.create.mockImplementation((value) => value);
    jobRuns.save.mockImplementation(async (value) => ({
      id: 1,
      ...value,
    }));

    dataSource.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    config.get.mockImplementation((_name, defaultValue) => defaultValue);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetentionService,
        { provide: getRepositoryToken(UserStatusLog), useValue: statusLogs },
        { provide: getRepositoryToken(AuthEventLog), useValue: authEventLogs },
        {
          provide: getRepositoryToken(RetentionLegalHold),
          useValue: legalHolds,
        },
        { provide: getRepositoryToken(RetentionJobRun), useValue: jobRuns },
        { provide: ConfigService, useValue: config },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<RetentionService>(RetentionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('records a successful retention run and deletion counts', async () => {
    dataSource.query
      .mockReset()
      .mockResolvedValueOnce([{ id: 'status-1' }, { id: 'status-2' }])
      .mockResolvedValueOnce([{ id: 'auth-1' }]);

    const result = await service.purge();

    expect(result).toEqual({ statusLogs: 2, authEventLogs: 1 });
    expect(jobRuns.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'succeeded',
        deletedCounts: { statusLogs: 2, authEventLogs: 1 },
      })
    );
  });

  it('uses configured retention periods', async () => {
    config.get.mockImplementation((name, defaultValue) => {
      if (name === 'STATUS_LOG_RETENTION_DAYS') return '30';
      if (name === 'AUTH_EVENT_RETENTION_DAYS') return '60';
      return defaultValue;
    });

    await service.purge();

    expect(config.get).toHaveBeenCalledWith('STATUS_LOG_RETENTION_DAYS', 90);
    expect(config.get).toHaveBeenCalledWith('AUTH_EVENT_RETENTION_DAYS', 180);
  });

  it('rejects an invalid retention period and records a failed run', async () => {
    config.get.mockImplementation((name, defaultValue) =>
      name === 'STATUS_LOG_RETENTION_DAYS' ? 0 : defaultValue
    );

    await expect(service.purge()).rejects.toThrow(
      'Invalid retention period for STATUS_LOG_RETENTION_DAYS: 0'
    );

    expect(jobRuns.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorMessage: expect.stringContaining('Invalid retention period'),
      })
    );
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('records a failed run when a database operation fails', async () => {
    dataSource.query.mockReset().mockRejectedValueOnce(new Error('DB connection lost'));

    await expect(service.purge()).rejects.toThrow('DB connection lost');

    expect(jobRuns.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorMessage: 'DB connection lost',
      })
    );
  });

  it('excludes active legal holds in both deletion queries', async () => {
    await service.purge();

    const queries = dataSource.query.mock.calls.map(([sql]) => sql);

    expect(queries).toHaveLength(2);
    for (const sql of queries) {
      expect(sql).toContain('retention_legal_holds');
      expect(sql).toContain('"released_at" IS NULL');
    }
  });
});
