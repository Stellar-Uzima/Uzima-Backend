import { ConflictException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Role } from '@modules/auth/enums/role.enum';
import { HealthProgramEnrollment } from '../../entities/health-program-enrollment.entity';
import { HealthProgramEnrollmentHistory } from '../../entities/health-program-enrollment-history.entity';
import { HealthProgramEnrollmentService } from './health-program-enrollment.service';
import { HealthProgramEnrollmentState as State } from './enums/health-program-enrollment-state.enum';

describe('HealthProgramEnrollmentService', () => {
  const enrollmentRepository = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({
      ...value,
      id: value.id ?? 'enrollment-1',
    })),
    update: jest.fn(),
  };
  const historyRepository = {
    create: jest.fn((value) => value),
    save: jest.fn(),
  };
  const manager = {
    getRepository: jest.fn((entity) =>
      entity === HealthProgramEnrollment ? enrollmentRepository : historyRepository
    ),
  };
  const dataSource = {
    getRepository: jest.fn(),
    transaction: jest.fn((callback) => callback(manager)),
  } as unknown as DataSource;
  let service: HealthProgramEnrollmentService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HealthProgramEnrollmentService(dataSource);
    enrollmentRepository.findOne.mockResolvedValue({
      id: 'enrollment-1',
      userId: 'user-1',
      programCode: 'MATERNAL',
      state: State.ELIGIBLE,
    });
    enrollmentRepository.update.mockResolvedValue({ affected: 1 });
    historyRepository.save.mockImplementation(async (record) => record);
  });

  it('persists a valid user enrollment transition and its history together', async () => {
    const result = await service.updateState('user-1', 'maternal', 'user-1', Role.USER, {
      state: State.ENROLLED,
      reason: '  Accepted  ',
    });

    expect(enrollmentRepository.update).toHaveBeenCalledWith(
      { id: 'enrollment-1', state: State.ELIGIBLE },
      expect.objectContaining({ state: State.ENROLLED })
    );
    expect(historyRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        programCode: 'MATERNAL',
        previousState: State.ELIGIBLE,
        newState: State.ENROLLED,
        changedBy: 'user-1',
        reason: 'Accepted',
      })
    );
    expect(result.state).toBe(State.ENROLLED);
  });

  it('creates an enrollment when an admin first determines eligibility', async () => {
    enrollmentRepository.findOne.mockResolvedValueOnce(null);

    const result = await service.updateState('user-1', 'maternal', 'admin-1', Role.ADMIN, {
      state: State.ELIGIBLE,
    });

    expect(enrollmentRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ state: State.PENDING })
    );
    expect(historyRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        previousState: State.PENDING,
        newState: State.ELIGIBLE,
      })
    );
    expect(result.state).toBe(State.ELIGIBLE);
  });

  it('rejects invalid transitions without persisting a change', async () => {
    await expect(
      service.updateState('user-1', 'MATERNAL', 'admin-1', Role.ADMIN, {
        state: State.WITHDRAWN,
      })
    ).rejects.toBeInstanceOf(ConflictException);

    expect(enrollmentRepository.update).not.toHaveBeenCalled();
    expect(historyRepository.save).not.toHaveBeenCalled();
  });

  it('prevents a user from changing their eligibility state', async () => {
    await expect(
      service.updateState('user-1', 'MATERNAL', 'user-1', Role.USER, {
        state: State.INELIGIBLE,
      })
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects a stale transition if another request changed the state', async () => {
    enrollmentRepository.update.mockResolvedValueOnce({ affected: 0 });

    await expect(
      service.updateState('user-1', 'MATERNAL', 'user-1', Role.USER, {
        state: State.ENROLLED,
      })
    ).rejects.toBeInstanceOf(ConflictException);

    expect(historyRepository.save).not.toHaveBeenCalled();
  });
});
