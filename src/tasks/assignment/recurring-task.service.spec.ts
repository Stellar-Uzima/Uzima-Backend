import { RecurringTaskService } from './recurring-task.service';
import { Recurrence } from '../entities/health-task.entity';

const mockHealthTaskRepo = { find: jest.fn() };
const mockAssignmentRepo = {
  findOne: jest.fn(),
  create: jest.fn((d) => d),
  save: jest.fn(),
};
const mockUserRepo = { find: jest.fn() };

describe('RecurringTaskService', () => {
  let service: RecurringTaskService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RecurringTaskService(
      mockHealthTaskRepo as any,
      mockAssignmentRepo as any,
      mockUserRepo as any,
    );
  });

  it('should be defined', () => { expect(service).toBeDefined(); });

  it('generateAssignmentsForDate does nothing when no recurring tasks', async () => {
    mockHealthTaskRepo.find.mockResolvedValue([]);
    await service.generateAssignmentsForDate('2026-06-02');
    expect(mockUserRepo.find).not.toHaveBeenCalled();
  });

  it('generateAssignmentsForDate creates assignment for active user with DAILY task', async () => {
    mockHealthTaskRepo.find.mockResolvedValue([{
      id: 't1', isActive: true, recurrence: Recurrence.DAILY, title: 'Walk',
    }]);
    mockUserRepo.find.mockResolvedValue([{ id: 'u1', isActive: true }]);
    mockAssignmentRepo.findOne.mockResolvedValue(null);
    mockAssignmentRepo.save.mockResolvedValue({});

    await service.generateAssignmentsForDate('2026-06-02');

    expect(mockAssignmentRepo.save).toHaveBeenCalled();
  });

  it('WEEKLY task is only assigned on Monday', async () => {
    const monday = '2026-06-02'; // a Monday
    const tuesday = '2026-06-03';
    mockHealthTaskRepo.find.mockResolvedValue([{
      id: 't2', isActive: true, recurrence: Recurrence.WEEKLY, title: 'Gym',
    }]);
    mockUserRepo.find.mockResolvedValue([{ id: 'u1', isActive: true }]);
    mockAssignmentRepo.findOne.mockResolvedValue(null);
    mockAssignmentRepo.save.mockResolvedValue({});

    await service.generateAssignmentsForDate(monday);
    expect(mockAssignmentRepo.save).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();
    mockHealthTaskRepo.find.mockResolvedValue([{ id: 't2', isActive: true, recurrence: Recurrence.WEEKLY }]);
    mockUserRepo.find.mockResolvedValue([{ id: 'u1', isActive: true }]);
    mockAssignmentRepo.findOne.mockResolvedValue(null);

    await service.generateAssignmentsForDate(tuesday);
    expect(mockAssignmentRepo.save).not.toHaveBeenCalled();
  });
});