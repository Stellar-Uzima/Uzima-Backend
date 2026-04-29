import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, QueryRunner } from 'typeorm';
import {
  TransactionService,
  TransactionOptions,
} from './transaction.service';

describe('TransactionService', () => {
  let service: TransactionService;
  let mockDataSource: Partial<DataSource>;
  let mockQueryRunner: Partial<QueryRunner>;

  beforeEach(async () => {
    // Mock QueryRunner
    mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([]),
      manager: {
        save: jest.fn(),
        find: jest.fn(),
        findOne: jest.fn(),
      },
    };

    // Mock DataSource
    mockDataSource = {
      createQueryRunner: jest
        .fn()
        .mockReturnValue(mockQueryRunner),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionService,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<TransactionService>(TransactionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('startTransaction', () => {
    it('should start a new transaction at depth 0', async () => {
      const contextId = 'test-context';

      const queryRunner = await service.startTransaction(contextId);

      expect(mockDataSource.createQueryRunner).toHaveBeenCalled();
      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalledWith(
        'READ COMMITTED',
      );
      expect(queryRunner).toBe(mockQueryRunner);
    });

    it('should create a savepoint for nested transactions', async () => {
      const contextId = 'test-context';

      // Start first transaction
      await service.startTransaction(contextId);

      // Start nested transaction (should create savepoint)
      const nestedQueryRunner = await service.startTransaction(contextId);

      expect(mockQueryRunner.query).toHaveBeenCalledWith(
        expect.stringContaining('SAVEPOINT'),
      );
      expect(nestedQueryRunner).toBe(mockQueryRunner);
    });

    it('should respect custom isolation levels', async () => {
      const contextId = 'test-context';

      const queryRunner = await service.startTransaction(contextId, {
        isolationLevel: 'SERIALIZABLE',
      });

      expect(mockQueryRunner.startTransaction).toHaveBeenCalledWith(
        'SERIALIZABLE',
      );
    });

    it('should throw error if connection fails', async () => {
      const contextId = 'test-context';
      (mockQueryRunner.connect as jest.Mock).mockRejectedValueOnce(
        new Error('Connection failed'),
      );

      await expect(service.startTransaction(contextId)).rejects.toThrow(
        'Failed to start transaction',
      );
    });
  });

  describe('commitTransaction', () => {
    it('should commit the main transaction', async () => {
      const contextId = 'test-context';

      await service.startTransaction(contextId);
      await service.commitTransaction(contextId);

      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should release savepoint for nested transactions', async () => {
      const contextId = 'test-context';

      await service.startTransaction(contextId);
      await service.startTransaction(contextId);
      await service.commitTransaction(contextId);

      expect(mockQueryRunner.query).toHaveBeenCalledWith(
        expect.stringContaining('RELEASE SAVEPOINT'),
      );
    });

    it('should throw error when committing non-existent transaction', async () => {
      const contextId = 'non-existent';

      await expect(service.commitTransaction(contextId)).rejects.toThrow(
        'No active transaction to commit',
      );
    });

    it('should check timeout before commit', async () => {
      const contextId = 'test-context';

      await service.startTransaction(contextId, { timeout: 100 });

      // Wait to exceed timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      await expect(service.commitTransaction(contextId)).rejects.toThrow();
    });
  });

  describe('rollbackTransaction', () => {
    it('should rollback the main transaction', async () => {
      const contextId = 'test-context';

      await service.startTransaction(contextId);
      await service.rollbackTransaction(contextId);

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should restore to savepoint for nested transactions', async () => {
      const contextId = 'test-context';

      await service.startTransaction(contextId);
      await service.startTransaction(contextId);
      await service.rollbackTransaction(contextId);

      expect(mockQueryRunner.query).toHaveBeenCalledWith(
        expect.stringContaining('ROLLBACK TO SAVEPOINT'),
      );
    });

    it('should throw error when rolling back non-existent transaction', async () => {
      const contextId = 'non-existent';

      await expect(service.rollbackTransaction(contextId)).rejects.toThrow(
        'No active transaction to rollback',
      );
    });
  });

  describe('execute', () => {
    it('should execute callback and commit on success', async () => {
      const contextId = 'test-context';
      const callback = jest
        .fn()
        .mockResolvedValue('success');

      const result = await service.execute(contextId, callback);

      expect(callback).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(result).toBe('success');
    });

    it('should rollback on callback error', async () => {
      const contextId = 'test-context';
      const testError = new Error('Test error');
      const callback = jest
        .fn()
        .mockRejectedValue(testError);

      await expect(service.execute(contextId, callback)).rejects.toThrow(
        testError,
      );
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('should cleanup transaction context on error', async () => {
      const contextId = 'test-context';
      const callback = jest
        .fn()
        .mockRejectedValue(new Error('Test error'));

      try {
        await service.execute(contextId, callback);
      } catch (error) {
        // Expected
      }

      const depth = service.getTransactionDepth(contextId);
      expect(depth).toBe(0);
    });
  });

  describe('getCurrentQueryRunner', () => {
    it('should return current query runner', async () => {
      const contextId = 'test-context';

      await service.startTransaction(contextId);
      const queryRunner = service.getCurrentQueryRunner(contextId);

      expect(queryRunner).toBe(mockQueryRunner);
    });

    it('should return null when no transaction is active', async () => {
      const contextId = 'non-existent';

      const queryRunner = service.getCurrentQueryRunner(contextId);

      expect(queryRunner).toBeNull();
    });
  });

  describe('getTransactionDepth', () => {
    it('should return correct depth', async () => {
      const contextId = 'test-context';

      expect(service.getTransactionDepth(contextId)).toBe(0);

      await service.startTransaction(contextId);
      expect(service.getTransactionDepth(contextId)).toBe(1);

      await service.startTransaction(contextId);
      expect(service.getTransactionDepth(contextId)).toBe(2);

      await service.rollbackTransaction(contextId);
      expect(service.getTransactionDepth(contextId)).toBe(1);
    });
  });

  describe('isTransactionTimedOut', () => {
    it('should detect timeout', async () => {
      const contextId = 'test-context';

      await service.startTransaction(contextId, { timeout: 100 });

      expect(service.isTransactionTimedOut(contextId)).toBe(false);

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(service.isTransactionTimedOut(contextId)).toBe(true);
    });

    it('should return false when no timeout is set', async () => {
      const contextId = 'test-context';

      await service.startTransaction(contextId);

      expect(service.isTransactionTimedOut(contextId)).toBe(false);
    });

    it('should return false when no transaction is active', async () => {
      const contextId = 'non-existent';

      expect(service.isTransactionTimedOut(contextId)).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should cleanup all transactions', async () => {
      const contextId = 'test-context';

      await service.startTransaction(contextId);
      await service.startTransaction(contextId);

      await service.cleanup(contextId);

      expect(service.getTransactionDepth(contextId)).toBe(0);
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should not throw when cleaning up non-existent context', async () => {
      const contextId = 'non-existent';

      await expect(service.cleanup(contextId)).resolves.not.toThrow();
    });
  });

  describe('nested transactions', () => {
    it('should support multiple levels of nesting', async () => {
      const contextId = 'test-context';

      // First level
      await service.startTransaction(contextId);
      expect(service.getTransactionDepth(contextId)).toBe(1);

      // Second level
      await service.startTransaction(contextId);
      expect(service.getTransactionDepth(contextId)).toBe(2);

      // Third level
      await service.startTransaction(contextId);
      expect(service.getTransactionDepth(contextId)).toBe(3);

      // Rollback third level
      await service.rollbackTransaction(contextId);
      expect(service.getTransactionDepth(contextId)).toBe(2);

      // Commit second level
      await service.commitTransaction(contextId);
      expect(service.getTransactionDepth(contextId)).toBe(1);

      // Commit first level
      await service.commitTransaction(contextId);
      expect(service.getTransactionDepth(contextId)).toBe(0);
    });
  });

  describe('atomicity', () => {
    it('should ensure atomicity with execute callback', async () => {
      const contextId = 'test-context';
      const operations: string[] = [];

      const callback = async (queryRunner: QueryRunner) => {
        operations.push('operation1');
        operations.push('operation2');
        operations.push('operation3');
      };

      await service.execute(contextId, callback);

      expect(operations.length).toBe(3);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should rollback all changes on error', async () => {
      const contextId = 'test-context';
      const operations: string[] = [];

      const callback = async (queryRunner: QueryRunner) => {
        operations.push('operation1');
        operations.push('operation2');
        throw new Error('Simulated error');
      };

      try {
        await service.execute(contextId, callback);
      } catch (error) {
        // Expected
      }

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });
});
