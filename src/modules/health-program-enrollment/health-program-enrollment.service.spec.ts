import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Role } from '@modules/auth/enums/role.enum';
import {
  HealthProgramEnrollment,
  HealthProgramEnrollmentHistory,
  HealthProgramEnrollmentStatus as Status,
} from './entities/health-program-enrollment.entity';
import { HealthProgramEnrollmentService } from './health-program-enrollment.service';

describe('HealthProgramEnrollmentService', () => {
  let service: HealthProgramEnrollmentService;
  let dataSource: {
    getRepository: jest.Mock;
    transaction: jest.Mock;
  };
  let query: jest.Mock;
  let enrollmentRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let historyRepo: { find: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    query = jest.fn().mockResolvedValue([{ id: 'user-1' }]);
    enrollmentRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'enrollment-1', ...value })),
    };
    historyRepo = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockResolvedValue({}),
    };

    const repositories = new Map([
      [HealthProgramEnrollment, enrollmentRepo],
      [HealthProgramEnrollmentHistory, historyRepo],
    ]);
    const manager = {
      getRepository: jest.fn((entity) => repositories.get(entity)),
      query,
    };
    dataSource = {
      getRepository: jest.fn((entity) => repositories.get(entity)),
      transaction: jest.fn((callback) => callback(manager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthProgramEnrollmentService,
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    service = module.get(HealthProgramEnrollmentService);
  });

  it('updates eligibility and records its actor and prior state atomically', async () => {
    await service.updateStatus('user-1', 'staff-1', Role.HEALER, {
      status: Status.ELIGIBLE,
      reason: 'Eligibility verified',
    });

    expect(enrollmentRepo.save).toHaveBeenCalledWith({
      userId: 'user-1',
      status: Status.ELIGIBLE,
    });
    expect(historyRepo.save).toHaveBeenCalledWith({
      userId: 'user-1',
      fromStatus: Status.PENDING,
      toStatus: Status.ELIGIBLE,
      changedById: 'staff-1',
      reason: 'Eligibility verified',
    });
    expect(query).toHaveBeenCalledWith(
      'SELECT "id" FROM "users" WHERE "id" = $1 AND "deleted_at" IS NULL FOR UPDATE',
      ['user-1']
    );
  });

  it('allows a user to enroll only after becoming eligible', async () => {
    enrollmentRepo.findOne.mockResolvedValue({
      id: 'enrollment-1',
      userId: 'user-1',
      status: Status.ELIGIBLE,
    });

    await service.updateStatus('user-1', 'user-1', Role.USER, {
      status: Status.ENROLLED,
    });

    expect(enrollmentRepo.save).toHaveBeenCalledWith({
      id: 'enrollment-1',
      userId: 'user-1',
      status: Status.ENROLLED,
    });
    expect(historyRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        fromStatus: Status.ELIGIBLE,
        toStatus: Status.ENROLLED,
        changedById: 'user-1',
      })
    );
  });

  it('prevents users from changing eligibility', async () => {
    await expect(
      service.updateStatus('user-1', 'user-1', Role.USER, {
        status: Status.ELIGIBLE,
      })
    ).rejects.toThrow(ForbiddenException);

    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects invalid state transitions without writing state or history', async () => {
    await expect(
      service.updateStatus('user-1', 'user-1', Role.USER, {
        status: Status.ENROLLED,
      })
    ).rejects.toThrow(BadRequestException);

    expect(enrollmentRepo.save).not.toHaveBeenCalled();
    expect(historyRepo.save).not.toHaveBeenCalled();
  });

  it('does not expose another user history to an ordinary user', async () => {
    await expect(service.getHistory('user-2', 'user-1', Role.USER)).rejects.toThrow(
      ForbiddenException
    );

    expect(historyRepo.find).not.toHaveBeenCalled();
  });
});
