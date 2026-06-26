import { Test, TestingModule } from '@nestjs/testing';
import { AdminTasksController } from './admin-tasks.controller';
import { BulkTaskAssignmentService } from '@/tasks/assignment/bulk-task-assignment.service';
import { QueueService } from '@/shared/queue/queue.service';

describe('AdminTasksController', () => {
  let controller: AdminTasksController;

  const mockBulkService = {
    validateBulkAssignPayload: jest.fn(),
  };
  const mockQueueService = {
    enqueueBulkTaskAssignment: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminTasksController],
      providers: [
        { provide: BulkTaskAssignmentService, useValue: mockBulkService },
        { provide: QueueService, useValue: mockQueueService },
      ],
    }).compile();

    controller = module.get(AdminTasksController);
  });

  it('returns job ID when bulk assignment is queued', async () => {
    mockQueueService.enqueueBulkTaskAssignment.mockResolvedValue({ id: 'job-42' });

    const result = await controller.bulkAssign({
      userIds: ['11111111-1111-4111-8111-111111111111'],
      taskIds: ['22222222-2222-4222-8222-222222222222'],
    });

    expect(mockBulkService.validateBulkAssignPayload).toHaveBeenCalled();
    expect(mockQueueService.enqueueBulkTaskAssignment).toHaveBeenCalled();
    expect(result.jobId).toBe('job-42');
    expect(result.queuedUsers).toBe(1);
    expect(result.taskCount).toBe(1);
  });
});
