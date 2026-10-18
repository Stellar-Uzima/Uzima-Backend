import { getQueueToken } from '@nestjs/bull';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StorageService } from '../../storage/storage.service';
import { HealthTask } from '../entities/health-task.entity';
import { TaskCompletion } from '../entities/task-completion.entity';
import { REWARD_QUEUE, PROOF_VERIFICATION_QUEUE } from '../../queue/queue.constants';
import { TaskCompletionService } from './task-completion.service';

describe('TaskCompletionService private proof access', () => {
  let service: TaskCompletionService;

  const queryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };
  const completionRepository = {
    createQueryBuilder: jest.fn(() => queryBuilder),
    findOne: jest.fn(),
  };
  const taskRepository = {};
  const rewardQueue = { add: jest.fn() };
  const proofVerificationQueue = { add: jest.fn() };
  const eventEmitter = { emit: jest.fn() };
  const storageService = { getDownloadUrl: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskCompletionService,
        { provide: getRepositoryToken(TaskCompletion), useValue: completionRepository },
        { provide: getRepositoryToken(HealthTask), useValue: taskRepository },
        { provide: getQueueToken(REWARD_QUEUE), useValue: rewardQueue },
        { provide: getQueueToken(PROOF_VERIFICATION_QUEUE), useValue: proofVerificationQueue },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: StorageService, useValue: storageService },
      ],
    }).compile();
    service = module.get(TaskCompletionService);
  });

  it('omits the internal object key from completion-list responses', async () => {
    queryBuilder.getMany.mockResolvedValue([
      {
        id: 'completion-1',
        proofUrl: 'proofs/user-1/task-1/123',
        status: 'pending',
      },
    ]);

    await expect(service.getUserCompletions('user-1')).resolves.toEqual([
      {
        id: 'completion-1',
        status: 'pending',
        proofAvailable: true,
      },
    ]);
  });

  it('returns only a short-lived download URL for a proof owned by the requester', async () => {
    completionRepository.findOne.mockResolvedValue({
      proofUrl: 'proofs/user-1/task-1/123',
    });
    storageService.getDownloadUrl.mockResolvedValue('https://signed.example/proof');

    await expect(
      service.getProofDownloadUrl('user-1', 'completion-1'),
    ).resolves.toEqual({
      downloadUrl: 'https://signed.example/proof',
      expiresIn: 300,
    });
    expect(completionRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'completion-1', userId: 'user-1' },
    });
    expect(storageService.getDownloadUrl).toHaveBeenCalledWith(
      'proofs/user-1/task-1/123',
      300,
    );
  });

  it('does not issue a download URL when the requester does not own a proof', async () => {
    completionRepository.findOne.mockResolvedValue(null);

    await expect(
      service.getProofDownloadUrl('other-user', 'completion-1'),
    ).rejects.toThrow('Task proof not found');
    expect(storageService.getDownloadUrl).not.toHaveBeenCalled();
  });
});
