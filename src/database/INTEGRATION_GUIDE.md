/**
 * Integration Guide: Migrating Services to Use TransactionService
 *
 * This file provides step-by-step instructions for integrating the TransactionService
 * into existing service files in your application.
 */

// ============================================================================
// STEP 1: Add TransactionService Injection
// ============================================================================

// BEFORE:
// --------
// @Injectable()
// export class OrderService {
//   constructor(
//     @InjectRepository(Order)
//     private readonly orderRepository: Repository<Order>,
//     @InjectRepository(OrderItem)
//     private readonly orderItemRepository: Repository<OrderItem>,
//   ) {}
// }

// AFTER:
// --------
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryRunner } from 'typeorm';
import {
  TransactionService,
  InjectTransaction,
} from '../../database/services/transaction.service';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    @InjectTransaction()
    private readonly transactionService: TransactionService,
  ) {}
}

// ============================================================================
// STEP 2: Wrap Multi-Step Operations in Transactions
// ============================================================================

// BEFORE:
// --------
// async createOrder(createOrderDto: CreateOrderDto): Promise<Order> {
//   const order = this.orderRepository.create(createOrderDto);
//   const savedOrder = await this.orderRepository.save(order);
//
//   for (const itemDto of createOrderDto.items) {
//     const item = new OrderItem();
//     item.order = savedOrder;
//     item.quantity = itemDto.quantity;
//     await this.orderItemRepository.save(item);
//   }
//
//   return savedOrder;
// }

// AFTER:
// --------
// async createOrder(createOrderDto: CreateOrderDto): Promise<Order> {
//   const contextId = `createOrder:${Date.now()}`;
//
//   return this.transactionService.execute(
//     contextId,
//     async (queryRunner: QueryRunner) => {
//       const order = this.orderRepository.create(createOrderDto);
//       const savedOrder = await queryRunner.manager.save(order);
//
//       for (const itemDto of createOrderDto.items) {
//         const item = new OrderItem();
//         item.order = savedOrder;
//         item.quantity = itemDto.quantity;
//         await queryRunner.manager.save(item);
//       }
//
//       return savedOrder;
//     },
//     {
//       timeout: 10000,
//       isolationLevel: 'READ COMMITTED',
//     },
//   );
// }

// ============================================================================
// STEP 3: Update Repository Methods to Use QueryRunner Manager
// ============================================================================

// BEFORE:
// --------
// async updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order> {
//   const order = await this.orderRepository.findOne({ where: { id: orderId } });
//   order.status = status;
//   return this.orderRepository.save(order);
// }

// AFTER (when called within transaction):
// --------
// Updates to use queryRunner.manager instead of this.orderRepository

// Example within transaction:
// const order = await queryRunner.manager.findOne(Order, {
//   where: { id: orderId }
// });
// order.status = status;
// await queryRunner.manager.save(order);

// ============================================================================
// STEP 4: Handle Errors Properly
// ============================================================================

// BEFORE:
// --------
// async complexOperation(): Promise<void> {
//   try {
//     await this.operation1();
//     await this.operation2();
//     await this.operation3();
//   } catch (error) {
//     throw error; // Partial state may be saved
//   }
// }

// AFTER:
// --------
// async complexOperation(): Promise<void> {
//   const contextId = `complexOp:${Date.now()}`;
//
//   await this.transactionService.execute(
//     contextId,
//     async (queryRunner) => {
//       try {
//         await this.operation1(queryRunner);
//         await this.operation2(queryRunner);
//         await this.operation3(queryRunner);
//       } catch (error) {
//         this.logger.error(`Operation failed: ${error.message}`);
//         throw error; // Transaction will be rolled back automatically
//       }
//     },
//     { timeout: 15000 },
//   );
// }

// ============================================================================
// STEP 5: Refactor Services Requiring Transactions
// ============================================================================

/**
 * Example: Full refactoring of a complex service method
 * 
 * This example shows how to refactor the coupon service's createForMilestone
 * method to use transactions.
 */

// Target: CouponService
// Implementation approach for refactoring:

import { Logger } from '@nestjs/common';

@Injectable()
export class RefactoredCouponService {
  private readonly logger = new Logger(RefactoredCouponService.name);

  constructor(
    @InjectRepository(Coupon)
    private readonly couponRepository: Repository<Coupon>,
    @InjectTransaction()
    private readonly transactionService: TransactionService,
  ) {}

  /**
   * Create coupon for user milestone - REFACTORED WITH TRANSACTIONS
   * Ensures atomicity: either all operations succeed or all are rolled back
   */
  async createForMilestoneWithTransaction(
    userId: string,
    payload?: { specialistType?: string; discount?: number },
  ): Promise<Coupon | null> {
    const contextId = `createCouponMilestone:${userId}:${Date.now()}`;

    return this.transactionService.execute(
      contextId,
      async (queryRunner: QueryRunner) => {
        // Step 1: Check active coupons (within transaction)
        const activeCount = await queryRunner.manager.count(Coupon, {
          where: { userId, status: CouponStatus.ACTIVE },
        });

        if (activeCount >= MAX_ACTIVE_COUPONS_PER_USER) {
          this.logger.warn(
            `User ${userId} has max active coupons, skipping creation`,
          );
          return null;
        }

        // Step 2: Create new coupon (within same transaction)
        const coupon = this.couponRepository.create({
          userId,
          code: this.generateCouponCode(),
          status: CouponStatus.ACTIVE,
          validUntil: this.calculateValidUntil(),
          discount: payload?.discount || DEFAULT_DISCOUNT_PERCENT,
          specialistType: payload?.specialistType,
        });

        // Step 3: Save coupon
        const savedCoupon = await queryRunner.manager.save(coupon);

        this.logger.log(
          `Coupon ${savedCoupon.code} created for user ${userId}`,
        );

        return savedCoupon;
      },
      {
        timeout: 5000,
        isolationLevel: 'READ COMMITTED',
      },
    );
  }

  private generateCouponCode(): string {
    return `CPO-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private calculateValidUntil(): Date {
    return new Date(Date.now() + DEFAULT_COUPON_DAYS_VALID * 24 * 60 * 60 * 1000);
  }
}

// ============================================================================
// STEP 6: Key Services to Refactor (Priority Order)
// ============================================================================

/**
 * Priority list of services for transaction implementation:
 * 
 * HIGH PRIORITY (Financial/Critical Operations):
 * 1. WalletService - Fund transfers, balance updates
 * 2. RewardsService - Reward issuance and transfers
 * 3. TransactionService (already implemented)
 * 4. PaymentService - Payment processing
 * 
 * MEDIUM PRIORITY (Data Consistency):
 * 5. OrderService - Order and item creation
 * 6. UserService - User creation with related data
 * 7. CouponService - Coupon creation and validation
 * 
 * LOWER PRIORITY (Non-Critical):
 * 8. NotificationService - Notification creation
 * 9. AuditService - Audit log creation
 * 10. HealthService - Health check operations
 */

// ============================================================================
// STEP 7: Module Configuration
// ============================================================================

/**
 * Ensure your module imports DatabaseModule to access TransactionService
 * 
 * Example:
 */

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    DatabaseModule, // ← Makes TransactionService available
    TypeOrmModule.forFeature([Coupon, Order, OrderItem]),
  ],
  providers: [RefactoredCouponService],
})
export class CouponsModule {}

// ============================================================================
// STEP 8: Testing Transactional Methods
// ============================================================================

/**
 * Testing strategy for transactional methods
 */

import { Test, TestingModule } from '@nestjs/testing';

describe('CouponService with Transactions', () => {
  let service: RefactoredCouponService;
  let transactionService: TransactionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefactoredCouponService,
        TransactionService,
        {
          provide: 'CouponRepository',
          useValue: {
            create: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(RefactoredCouponService);
    transactionService = module.get(TransactionService);
  });

  it('should create coupon in transaction', async () => {
    const coupon = await service.createForMilestoneWithTransaction('user123');
    expect(coupon).toBeDefined();
    // Verify transaction was committed
  });

  it('should rollback on error', async () => {
    try {
      // Simulate error during transaction
      await service.createForMilestoneWithTransaction('invalid-user');
    } catch (error) {
      // Transaction should be rolled back
      expect(error).toBeDefined();
    }
  });
});

// ============================================================================
// STEP 9: Migration Checklist
// ============================================================================

/**
 * Use this checklist when migrating a service:
 * 
 * □ Identify all multi-step operations
 * □ Add TransactionService injection
 * □ Wrap operations with transactionService.execute()
 * □ Update repository calls to use queryRunner.manager
 * □ Add appropriate timeouts
 * □ Add error handling and logging
 * □ Write/update unit tests
 * □ Test with integration tests
 * □ Add transaction context IDs for debugging
 * □ Document transaction usage in service
 * □ Review isolation level appropriateness
 * □ Performance test with expected load
 */

// ============================================================================
// STEP 10: Common Patterns
// ============================================================================

/**
 * Pattern 1: Simple data creation
 */
export class SimpleDataCreationExample {
  async createRecord(data: any): Promise<Record> {
    const contextId = `create:${Date.now()}`;

    return this.transactionService.execute(
      contextId,
      async (queryRunner) => {
        const record = this.repository.create(data);
        return queryRunner.manager.save(record);
      },
      { timeout: 3000 },
    );
  }
}

/**
 * Pattern 2: Complex operations with rollback
 */
export class ComplexOperationExample {
  async processComplexOperation(data: any): Promise<Result> {
    const contextId = `complex:${Date.now()}`;
    const queryRunner = await this.transactionService.startTransaction(
      contextId,
      { timeout: 10000 },
    );

    try {
      const step1Result = await this.step1(queryRunner, data);
      const step2Result = await this.step2(queryRunner, step1Result);
      const step3Result = await this.step3(queryRunner, step2Result);

      await this.transactionService.commitTransaction(contextId);
      return step3Result;
    } catch (error) {
      await this.transactionService.rollbackTransaction(contextId);
      throw error;
    }
  }
}

/**
 * Pattern 3: Nested operations
 */
export class NestedOperationExample {
  async parentOperation(data: any): Promise<Result> {
    const contextId = `parent:${Date.now()}`;

    return this.transactionService.execute(
      contextId,
      async (queryRunner) => {
        const parentResult = await this.createParent(queryRunner, data);

        // Child operations are nested automatically
        for (const childData of data.children) {
          await this.createChild(queryRunner, parentResult, childData);
        }

        return parentResult;
      },
      { timeout: 15000 },
    );
  }
}

/**
 * This guide should be followed when:
 * 1. Adding new services that perform multiple database operations
 * 2. Refactoring existing services for better consistency
 * 3. Fixing bugs related to partial state persistence
 * 4. Implementing financial or critical operations
 * 5. Handling concurrent operations that need isolation
 */
