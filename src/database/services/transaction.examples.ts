/**
 * Usage Examples for TransactionService
 * 
 * This file demonstrates various patterns for using the transaction service
 * in your application.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryRunner } from 'typeorm';
import { TransactionService, InjectTransaction, Transaction } from './transaction.service';

// Example 1: Basic transaction execution with callback pattern
@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectTransaction()
    private readonly transactionService: TransactionService,
  ) {}

  /**
   * Create multiple users in a single transaction
   * If any user creation fails, all changes are rolled back
   */
  async createUsersInTransaction(users: any[]): Promise<void> {
    const contextId = `createUsers:${Date.now()}`;

    await this.transactionService.execute(
      contextId,
      async (queryRunner: QueryRunner) => {
        for (const userData of users) {
          const user = this.userRepository.create(userData);
          await queryRunner.manager.save(user);
        }
      },
      {
        timeout: 10000, // 10 seconds
        isolationLevel: 'SERIALIZABLE',
      },
    );

    this.logger.log(`Successfully created ${users.length} users in a transaction`);
  }
}

// Example 2: Manual transaction control for complex operations
@Injectable()
export class TransferService {
  private readonly logger = new Logger(TransferService.name);

  constructor(
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    @InjectTransaction()
    private readonly transactionService: TransactionService,
  ) {}

  /**
   * Transfer funds between accounts
   * Demonstrates manual transaction management with multiple steps
   */
  async transferFunds(
    fromAccountId: string,
    toAccountId: string,
    amount: number,
  ): Promise<void> {
    const contextId = `transfer:${fromAccountId}:${toAccountId}:${Date.now()}`;
    const queryRunner = await this.transactionService.startTransaction(
      contextId,
      {
        isolationLevel: 'REPEATABLE READ',
        timeout: 5000,
      },
    );

    try {
      // Debit from source account
      const fromAccount = await queryRunner.manager.findOne(Account, {
        where: { id: fromAccountId },
      });

      if (!fromAccount || fromAccount.balance < amount) {
        throw new Error('Insufficient funds');
      }

      fromAccount.balance -= amount;
      await queryRunner.manager.save(fromAccount);

      // Credit to destination account
      const toAccount = await queryRunner.manager.findOne(Account, {
        where: { id: toAccountId },
      });

      if (!toAccount) {
        throw new Error('Destination account not found');
      }

      toAccount.balance += amount;
      await queryRunner.manager.save(toAccount);

      // Commit changes
      await this.transactionService.commitTransaction(contextId);
      this.logger.log(`Transferred ${amount} from ${fromAccountId} to ${toAccountId}`);
    } catch (error) {
      await this.transactionService.rollbackTransaction(contextId);
      this.logger.error(`Transfer failed: ${(error as Error).message}`);
      throw error;
    }
  }
}

// Example 3: Nested transactions using savepoints
@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    @InjectTransaction()
    private readonly transactionService: TransactionService,
  ) {}

  /**
   * Create order with items, demonstrating nested transactions
   * If an item fails, only that item is rolled back via savepoint
   */
  async createOrderWithItems(orderData: any, items: any[]): Promise<Order> {
    const contextId = `createOrder:${Date.now()}`;

    return this.transactionService.execute(
      contextId,
      async (queryRunner: QueryRunner) => {
        // Create main order (depth 0)
        const order = this.orderRepository.create(orderData);
        const savedOrder = await queryRunner.manager.save(order);

        // Create order items (depth 1 - nested transactions)
        for (const itemData of items) {
          try {
            const item = this.orderItemRepository.create({
              ...itemData,
              order: savedOrder,
            });
            await queryRunner.manager.save(item);
          } catch (error) {
            this.logger.warn(
              `Failed to create item, attempting partial rollback: ${(error as Error).message}`,
            );
            // In a real scenario, you might handle this differently
            throw error;
          }
        }

        return savedOrder;
      },
      {
        timeout: 15000,
        isolationLevel: 'READ COMMITTED',
      },
    );
  }
}

// Example 4: Using Transaction decorator for automatic management
@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private transactionService: TransactionService; // Would be injected in real code

  /**
   * Process payment with automatic transaction management via decorator
   * The @Transaction decorator automatically handles commit/rollback
   */
  @Transaction({
    timeout: 8000,
    isolationLevel: 'SERIALIZABLE',
  })
  async processPayment(
    paymentData: any,
  ): Promise<PaymentResult> {
    // Implementation using this.currentQueryRunner
    // Set automatically by the decorator
    return {
      transactionId: 'tx_123',
      status: 'completed',
    };
  }
}

// Example 5: Handling timeout scenarios
@Injectable()
export class BatchProcessService {
  private readonly logger = new Logger(BatchProcessService.name);

  constructor(
    @InjectRepository(Record)
    private readonly recordRepository: Repository<Record>,
    @InjectTransaction()
    private readonly transactionService: TransactionService,
  ) {}

  /**
   * Process batch of records with timeout protection
   */
  async processBatchWithTimeout(records: any[]): Promise<void> {
    const contextId = `batch:${Date.now()}`;
    const queryRunner = await this.transactionService.startTransaction(
      contextId,
      {
        timeout: 30000, // 30 second timeout
        isolationLevel: 'READ COMMITTED',
      },
    );

    try {
      for (const record of records) {
        // Check timeout before processing each record
        if (this.transactionService.isTransactionTimedOut(contextId)) {
          throw new Error('Transaction timeout exceeded');
        }

        // Process record
        const updatedRecord = await queryRunner.manager.findOne(Record, {
          where: { id: record.id },
        });

        if (updatedRecord) {
          updatedRecord.processed = true;
          updatedRecord.processedAt = new Date();
          await queryRunner.manager.save(updatedRecord);
        }
      }

      await this.transactionService.commitTransaction(contextId);
      this.logger.log(`Successfully processed ${records.length} records`);
    } catch (error) {
      await this.transactionService.rollbackTransaction(contextId);
      this.logger.error(`Batch processing failed: ${(error as Error).message}`);
      throw error;
    }
  }
}

// Example 6: Transaction cleanup middleware/interceptor
@Injectable()
export class TransactionCleanupInterceptor {
  constructor(
    @InjectTransaction()
    private readonly transactionService: TransactionService,
  ) {}

  /**
   * Call this at the end of request handling to ensure cleanup
   */
  async cleanupTransactions(contextId: string): Promise<void> {
    try {
      // Get current depth to log any unclosed transactions
      const depth = this.transactionService.getTransactionDepth(contextId);
      if (depth > 0) {
        console.warn(
          `Found ${depth} unclosed transactions during cleanup for context ${contextId}`,
        );
      }

      // Force cleanup of any remaining transactions
      await this.transactionService.cleanup(contextId);
    } catch (error) {
      console.error(
        `Error during transaction cleanup: ${(error as Error).message}`,
      );
    }
  }
}

// Types for examples (normally in their own entity files)
class User {
  id: string;
  name: string;
  email: string;
}

class Account {
  id: string;
  balance: number;
}

class Order {
  id: string;
  items: OrderItem[];
  total: number;
}

class OrderItem {
  id: string;
  order: Order;
  quantity: number;
}

class Record {
  id: string;
  processed: boolean;
  processedAt: Date;
}

interface PaymentResult {
  transactionId: string;
  status: string;
}

export {
  UserService,
  TransferService,
  OrderService,
  PaymentService,
  BatchProcessService,
  TransactionCleanupInterceptor,
};
