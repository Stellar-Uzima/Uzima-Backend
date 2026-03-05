import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProofVerificationService } from './proof-verification.service';
import { TaskCompletion, TaskCompletionStatus } from '../../entities/task-completion.entity';
import { StorageService } from '../../../storage/storage.service';

const mockTaskCompletionRepo = {
  findOne: jest.fn(),
  save: jest.fn(),
};

const mockStorageService = {
  verifyFileExists: jest.fn(),
};

const mockEventEmitter = {
  emit: jest.fn(),
};

describe('ProofVerificationService', () => {
  let service: ProofVerificationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProofVerificationService,
        {
          provide: getRepositoryToken(TaskCompletion),
          useValue: mockTaskCompletionRepo,
        },
        {
          provide: StorageService,
          useValue: mockStorageService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<ProofVerificationService>(ProofVerificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verifyProof', () => {
    it('should verify valid image proof', async () => {
      const completion = {
        id: 'completion-id',
        proofUrl: 'https://bucket.s3.amazonaws.com/proofs/user/task/file.jpg',
        user: { id: 'user-id' },
        task: { id: 'task-id' },
      };

      mockTaskCompletionRepo.findOne.mockResolvedValue(completion);
      mockStorageService.verifyFileExists.mockResolvedValue({
        exists: true,
        contentType: 'image/jpeg',
        size: 1024 * 1024, // 1MB
      });

      await service.verifyProof('completion-id');

      expect(mockTaskCompletionRepo.save).toHaveBeenCalledWith({
        ...completion,
        status: TaskCompletionStatus.VERIFIED,
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('task.verified', {
        completionId: 'completion-id',
        userId: 'user-id',
        taskId: 'task-id',
        xlmAmount: undefined, // Not set in completion
      });
    });

    it('should reject invalid file type', async () => {
      const completion = {
        id: 'completion-id',
        proofUrl: 'https://bucket.s3.amazonaws.com/proofs/user/task/file.txt',
        user: { id: 'user-id' },
        task: { id: 'task-id' },
      };

      mockTaskCompletionRepo.findOne.mockResolvedValue(completion);
      mockStorageService.verifyFileExists.mockResolvedValue({
        exists: true,
        contentType: 'text/plain',
        size: 1024,
      });

      await service.verifyProof('completion-id');

      expect(mockTaskCompletionRepo.save).toHaveBeenCalledWith({
        ...completion,
        status: TaskCompletionStatus.REJECTED,
        rejectionReason: 'Invalid file type. Only JPEG and PNG images are allowed',
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('task.rejected', {
        completionId: 'completion-id',
        userId: 'user-id',
        taskId: 'task-id',
        reason: 'Invalid file type. Only JPEG and PNG images are allowed',
      });
    });

    it('should reject file not found', async () => {
      const completion = {
        id: 'completion-id',
        proofUrl: 'https://bucket.s3.amazonaws.com/proofs/user/task/file.jpg',
        user: { id: 'user-id' },
        task: { id: 'task-id' },
      };

      mockTaskCompletionRepo.findOne.mockResolvedValue(completion);
      mockStorageService.verifyFileExists.mockResolvedValue({ exists: false });

      await service.verifyProof('completion-id');

      expect(mockTaskCompletionRepo.save).toHaveBeenCalledWith({
        ...completion,
        status: TaskCompletionStatus.REJECTED,
        rejectionReason: 'Proof file not found in storage',
      });
    });

    it('should reject oversized file', async () => {
      const completion = {
        id: 'completion-id',
        proofUrl: 'https://bucket.s3.amazonaws.com/proofs/user/task/file.jpg',
        user: { id: 'user-id' },
        task: { id: 'task-id' },
      };

      mockTaskCompletionRepo.findOne.mockResolvedValue(completion);
      mockStorageService.verifyFileExists.mockResolvedValue({
        exists: true,
        contentType: 'image/jpeg',
        size: 6 * 1024 * 1024, // 6MB
      });

      await service.verifyProof('completion-id');

      expect(mockTaskCompletionRepo.save).toHaveBeenCalledWith({
        ...completion,
        status: TaskCompletionStatus.REJECTED,
        rejectionReason: 'File size exceeds 5MB limit',
      });
    });

    it('should reject completion without proof URL', async () => {
      const completion = {
        id: 'completion-id',
        proofUrl: null,
        user: { id: 'user-id' },
        task: { id: 'task-id' },
      };

      mockTaskCompletionRepo.findOne.mockResolvedValue(completion);

      await service.verifyProof('completion-id');

      expect(mockTaskCompletionRepo.save).toHaveBeenCalledWith({
        ...completion,
        status: TaskCompletionStatus.REJECTED,
        rejectionReason: 'No proof URL provided',
      });
    });

    it('should handle completion not found', async () => {
      mockTaskCompletionRepo.findOne.mockResolvedValue(null);

      await service.verifyProof('completion-id');

      expect(mockTaskCompletionRepo.save).not.toHaveBeenCalled();
    });
  });
});