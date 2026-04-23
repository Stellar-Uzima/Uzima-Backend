import {
  Injectable,
  Logger,
  Inject,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import {
  setMetadata,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';

/**
 * Interface for transaction options
 */
export interface TransactionOptions {
  isolationLevel?: 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';
  timeout?: number; // milliseconds
  readonly?: boolean;
  depth?: number; // Track nested transaction depth
}

/**
 * Interface for transaction context
 */
export interface TransactionContext {
  queryRunner: QueryRunner;
  depth: number;
  startTime: number;
  timeout?: number;
}

/**
 * Transaction service for managing database transactions
 * Supports nested transactions using savepoints, automatic rollback on errors,
 * and timeout handling.
 */
@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);
  private readonly transactionStack: Map<string, TransactionContext[]> =
    new Map();

  constructor(@Inject(DataSource) private readonly dataSource: DataSource) {}

  /**
   * Start a new transaction or create a savepoint for nested transactions
   *
   * @param context - Transaction context (usually from request)
   * @param options - Transaction options
   * @returns QueryRunner instance
   */
  async startTransaction(
    context: string,
    options: TransactionOptions = {},
  ): Promise<QueryRunner> {
    const queryRunner = this.dataSource.createQueryRunner();
    const stack = this.transactionStack.get(context) || [];

    try {
      const depth = stack.length;
      const startTime = Date.now();
      const transactionContext: TransactionContext = {
        queryRunner,
        depth,
        startTime,
        timeout: options.timeout,
      };

      // Connect to database
      await queryRunner.connect();

      if (depth === 0) {
        // Start a new transaction at depth 0
        await queryRunner.startTransaction(
          options.isolationLevel || 'READ COMMITTED',
        );
        this.logger.debug(
          `[${context}] Transaction started at depth ${depth}`,
        );
      } else {
        // Create a savepoint for nested transactions
        const savepointName = `sp_${depth}_${Date.now()}`;
        await queryRunner.query(`SAVEPOINT ${savepointName}`);
        transactionContext['savepointName'] = savepointName;
        this.logger.debug(
          `[${context}] Savepoint ${savepointName} created at depth ${depth}`,
        );
      }

      stack.push(transactionContext);
      this.transactionStack.set(context, stack);

      return queryRunner;
    } catch (error) {
      await queryRunner.release();
      this.logger.error(
        `Failed to start transaction: ${(error as Error)?.message}`,
      );
      throw new InternalServerErrorException(
        `Failed to start transaction: ${(error as Error)?.message}`,
      );
    }
  }

  /**
   * Commit a transaction or release a savepoint
   *
   * @param context - Transaction context
   */
  async commitTransaction(context: string): Promise<void> {
    const stack = this.transactionStack.get(context);

    if (!stack || stack.length === 0) {
      throw new BadRequestException('No active transaction to commit');
    }

    const transactionContext = stack[stack.length - 1];
    const { queryRunner, depth } = transactionContext;

    try {
      // Check timeout
      if (transactionContext.timeout) {
        const elapsed = Date.now() - transactionContext.startTime;
        if (elapsed > transactionContext.timeout) {
          throw new Error(
            `Transaction exceeded timeout of ${transactionContext.timeout}ms`,
          );
        }
      }

      if (depth === 0) {
        // Commit the main transaction
        await queryRunner.commitTransaction();
        this.logger.debug(`[${context}] Transaction committed at depth ${depth}`);
      } else {
        // For nested transactions, release the savepoint
        const savepointName = transactionContext['savepointName'];
        await queryRunner.query(`RELEASE SAVEPOINT ${savepointName}`);
        this.logger.debug(
          `[${context}] Savepoint ${savepointName} released at depth ${depth}`,
        );
      }

      stack.pop();
    } catch (error) {
      this.logger.error(
        `Failed to commit transaction: ${(error as Error)?.message}`,
      );
      // Attempt rollback before throwing
      try {
        await this.rollbackTransaction(context, false);
      } catch (rollbackError) {
        this.logger.error(
          `Rollback after commit failure failed: ${(rollbackError as Error)?.message}`,
        );
      }
      throw new InternalServerErrorException(
        `Failed to commit transaction: ${(error as Error)?.message}`,
      );
    } finally {
      // Release the query runner if this was the last transaction
      if (stack.length === 0) {
        await queryRunner.release();
        this.transactionStack.delete(context);
      }
    }
  }

  /**
   * Rollback a transaction or restore to savepoint
   *
   * @param context - Transaction context
   * @param releaseRunner - Whether to release the query runner
   */
  async rollbackTransaction(
    context: string,
    releaseRunner: boolean = true,
  ): Promise<void> {
    const stack = this.transactionStack.get(context);

    if (!stack || stack.length === 0) {
      throw new BadRequestException('No active transaction to rollback');
    }

    const transactionContext = stack[stack.length - 1];
    const { queryRunner, depth } = transactionContext;

    try {
      if (depth === 0) {
        // Rollback the main transaction
        await queryRunner.rollbackTransaction();
        this.logger.debug(
          `[${context}] Transaction rolled back at depth ${depth}`,
        );
      } else {
        // Restore to savepoint for nested transactions
        const savepointName = transactionContext['savepointName'];
        await queryRunner.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
        this.logger.debug(
          `[${context}] Rolled back to savepoint ${savepointName} at depth ${depth}`,
        );
      }

      stack.pop();
    } catch (error) {
      this.logger.error(
        `Failed to rollback transaction: ${(error as Error)?.message}`,
      );
      throw new InternalServerErrorException(
        `Failed to rollback transaction: ${(error as Error)?.message}`,
      );
    } finally {
      // Release the query runner if needed and this was the last transaction
      if (releaseRunner && stack.length === 0) {
        await queryRunner.release();
        this.transactionStack.delete(context);
      }
    }
  }

  /**
   * Execute a callback within a transaction with automatic rollback on error
   *
   * @param context - Transaction context
   * @param callback - Operation to execute within transaction
   * @param options - Transaction options
   * @returns Result of the callback
   */
  async execute<T>(
    context: string,
    callback: (queryRunner: QueryRunner) => Promise<T>,
    options: TransactionOptions = {},
  ): Promise<T> {
    const queryRunner = await this.startTransaction(context, options);

    try {
      const result = await callback(queryRunner);
      await this.commitTransaction(context);
      return result;
    } catch (error) {
      await this.rollbackTransaction(context);
      this.logger.error(`Transaction execution failed: ${(error as Error)?.message}`);
      throw error;
    }
  }

  /**
   * Get the current query runner for the context
   * Useful when transaction is managed externally
   *
   * @param context - Transaction context
   * @returns Current QueryRunner or null
   */
  getCurrentQueryRunner(context: string): QueryRunner | null {
    const stack = this.transactionStack.get(context);
    return stack && stack.length > 0
      ? stack[stack.length - 1].queryRunner
      : null;
  }

  /**
   * Get the current transaction depth
   *
   * @param context - Transaction context
   * @returns Current depth (0 if no transaction)
   */
  getTransactionDepth(context: string): number {
    const stack = this.transactionStack.get(context);
    return stack ? stack.length : 0;
  }

  /**
   * cleanup all transactions for a context
   * Called on request cleanup
   *
   * @param context - Transaction context to cleanup
   */
  async cleanup(context: string): Promise<void> {
    const stack = this.transactionStack.get(context);

    if (!stack || stack.length === 0) {
      return;
    }

    // Rollback all remaining transactions
    while (stack.length > 0) {
      try {
        await this.rollbackTransaction(context, false);
      } catch (error) {
        this.logger.error(
          `Cleanup rollback failed: ${(error as Error)?.message}`,
        );
      }
    }

    // Release all query runners
    const queryRunner = stack[0]?.queryRunner;
    if (queryRunner) {
      try {
        await queryRunner.release();
      } catch (error) {
        this.logger.error(
          `Failed to release query runner during cleanup: ${(error as Error)?.message}`,
        );
      }
    }

    this.transactionStack.delete(context);
  }

  /**
   * Check if a transaction has exceeded its timeout
   *
   * @param context - Transaction context
   * @returns true if timeout exceeded
   */
  isTransactionTimedOut(context: string): boolean {
    const stack = this.transactionStack.get(context);

    if (!stack || stack.length === 0) {
      return false;
    }

    const transactionContext = stack[stack.length - 1];
    if (!transactionContext.timeout) {
      return false;
    }

    const elapsed = Date.now() - transactionContext.startTime;
    return elapsed > transactionContext.timeout;
  }
}

/**
 * Decorator to inject the TransactionService
 * Usage: constructor(@InjectTransaction() private transactionService: TransactionService)
 */
export const InjectTransaction = () =>
  Inject(TransactionService);

/**
 * Decorator for automatic transaction management
 * Handles transactions with automatic rollback on error
 *
 * @param options - Transaction options
 * 
 * Usage:
 * @Transaction({ timeout: 5000 })
 * async myMethod(
 *   @QueryRunnerInject() queryRunner: QueryRunner,
 *   @Context() context: string
 * ) {
 *   // Use queryRunner for database operations
 * }
 */
export function Transaction(options: TransactionOptions = {}) {
  return function (
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const context = `${target.constructor.name}:${String(propertyKey)}:${Date.now()}`;
      const transactionService = this.transactionService as TransactionService;

      try {
        return await transactionService.execute(
          context,
          async (queryRunner) => {
            // Set the queryRunner in the method context
            this.currentQueryRunner = queryRunner;
            return originalMethod.apply(this, args);
          },
          options,
        );
      } finally {
        // Cleanup
        await transactionService.cleanup(context);
        this.currentQueryRunner = null;
      }
    };

    return descriptor;
  };
}

/**
 * Parameter decorator to inject the current QueryRunner
 * Usage: @QueryRunnerInject() queryRunner: QueryRunner
 */
export const QueryRunnerInject = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    // Get the instance from the context
    const instance = ctx.getClass().prototype.constructor;
    return instance.prototype.currentQueryRunner || null;
  },
);

/**
 * Parameter decorator to inject the transaction context
 * Usage: @TransactionContext() context: string
 */
export const TransactionContextDecorator = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request['transactionContext'] || null;
  },
);

/**
 * Metadata key for transaction options
 */
export const TRANSACTION_METADATA_KEY = 'transaction:options';

/**
 * Set transaction metadata on a method
 */
export const setTransactionMetadata = (options: TransactionOptions) => {
  return setMetadata(TRANSACTION_METADATA_KEY, options);
};
