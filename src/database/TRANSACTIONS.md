# Transaction Service Documentation

## Overview

The `TransactionService` provides a robust, feature-rich transaction management system for TypeORM-based NestJS applications. It handles database transactions with automatic rollback on errors, supports nested transactions using savepoints, and includes timeout protection.

## Features

- ✅ **Transaction Wrapper**: Simple callback-based transaction execution
- ✅ **Automatic Rollback**: Automatic rollback on any error
- ✅ **Nested Transactions**: Support for nested transactions using PostgreSQL savepoints
- ✅ **Timeout Handling**: Configure and monitor transaction timeouts
- ✅ **Isolation Levels**: Support for different PostgreSQL isolation levels
- ✅ **Multiple Patterns**: Decorator-based and manual transaction control
- ✅ **Stack Management**: Proper tracking of transaction depth and state
- ✅ **Resource Cleanup**: Automatic cleanup of connections and resources

## Installation

The `TransactionService` is provided in the `DatabaseModule`. Ensure your module imports it:

```typescript
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [DatabaseModule, /* other modules */],
})
export class AppModule {}
```

## Usage Patterns

### Pattern 1: Callback-Based (Recommended for simple operations)

The simplest way to use transactions - execute a callback within an automatic transaction:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryRunner } from 'typeorm';
import { TransactionService, InjectTransaction } from './database/services/transaction.service';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectTransaction()
    private transactionService: TransactionService,
  ) {}

  async createUsers(userDataArray: any[]): Promise<void> {
    const contextId = `createUsers:${Date.now()}`;

    await this.transactionService.execute(
      contextId,
      async (queryRunner: QueryRunner) => {
        for (const userData of userDataArray) {
          const user = this.userRepository.create(userData);
          await queryRunner.manager.save(user);
        }
      },
      {
        timeout: 10000, // 10 seconds
        isolationLevel: 'SERIALIZABLE',
      },
    );
  }
}
```

### Pattern 2: Manual Transaction Control (For complex operations)

When you need finer control over when to commit or rollback:

```typescript
async transferFunds(
  fromAccountId: string,
  toAccountId: string,
  amount: number,
): Promise<void> {
  const contextId = `transfer:${fromAccountId}:${toAccountId}:${Date.now()}`;
  const queryRunner = await this.transactionService.startTransaction(contextId, {
    isolationLevel: 'REPEATABLE READ',
    timeout: 5000,
  });

  try {
    // Debit source account
    const fromAccount = await queryRunner.manager.findOne(Account, {
      where: { id: fromAccountId },
    });

    if (fromAccount.balance < amount) {
      throw new Error('Insufficient funds');
    }

    fromAccount.balance -= amount;
    await queryRunner.manager.save(fromAccount);

    // Credit destination account
    const toAccount = await queryRunner.manager.findOne(Account, {
      where: { id: toAccountId },
    });

    toAccount.balance += amount;
    await queryRunner.manager.save(toAccount);

    // Commit the transaction
    await this.transactionService.commitTransaction(contextId);
  } catch (error) {
    await this.transactionService.rollbackTransaction(contextId);
    throw error;
  }
}
```

### Pattern 3: Decorator-Based (For simple methods)

Automatically manage transactions with the `@Transaction` decorator:

```typescript
@Injectable()
export class PaymentService {
  constructor(
    private transactionService: TransactionService,
  ) {}

  @Transaction({
    timeout: 8000,
    isolationLevel: 'SERIALIZABLE',
  })
  async processPayment(paymentData: any): Promise<PaymentResult> {
    // Implicitly has transactional context
    // Automatic commit/rollback based on success/failure
    return {
      transactionId: 'tx_123',
      status: 'completed',
    };
  }
}
```

### Pattern 4: Nested Transactions with Savepoints

Automatically handled via savepoints:

```typescript
async createOrderWithItems(orderData: any, items: any[]): Promise<Order> {
  const contextId = `createOrder:${Date.now()}`;

  return this.transactionService.execute(
    contextId,
    async (queryRunner: QueryRunner) => {
      // Depth 0: Main transaction
      const order = this.orderRepository.create(orderData);
      const savedOrder = await queryRunner.manager.save(order);

      // Depth 1: Nested transaction via savepoint
      for (const itemData of items) {
        const item = this.orderItemRepository.create({
          ...itemData,
          order: savedOrder,
        });
        await queryRunner.manager.save(item);
      }

      return savedOrder;
    },
    {
      timeout: 15000,
      isolationLevel: 'READ COMMITTED',
    },
  );
}
```

## API Reference

### TransactionService Methods

#### `startTransaction(context: string, options?: TransactionOptions): Promise<QueryRunner>`

Start a new transaction or savepoint.

**Parameters:**
- `context`: Unique identifier for the transaction context (usually request-scoped)
- `options`: Configuration options

**Returns:** QueryRunner instance

**Example:**
```typescript
const queryRunner = await transactionService.startTransaction('myContext', {
  timeout: 5000,
  isolationLevel: 'READ COMMITTED',
});
```

#### `commitTransaction(context: string): Promise<void>`

Commit the current transaction or release the savepoint.

**Parameters:**
- `context`: Transaction context identifier

**Throws:** BadRequestException if no active transaction

**Example:**
```typescript
await transactionService.commitTransaction('myContext');
```

#### `rollbackTransaction(context: string, releaseRunner?: boolean): Promise<void>`

Rollback the current transaction or restore to the savepoint.

**Parameters:**
- `context`: Transaction context identifier
- `releaseRunner`: Whether to release the query runner (default: true)

**Example:**
```typescript
await transactionService.rollbackTransaction('myContext');
```

#### `execute<T>(context: string, callback: (queryRunner: QueryRunner) => Promise<T>, options?: TransactionOptions): Promise<T>`

Execute a callback within an automatic transaction with automatic commit/rollback.

**Parameters:**
- `context`: Transaction context identifier
- `callback`: Function to execute within transaction
- `options`: Configuration options

**Returns:** Result of the callback

**Example:**
```typescript
const result = await transactionService.execute(
  'myContext',
  async (queryRunner) => {
    // Perform operations
    return someResult;
  },
  { timeout: 5000 }
);
```

#### `getCurrentQueryRunner(context: string): QueryRunner | null`

Get the current query runner for a context.

**Parameters:**
- `context`: Transaction context identifier

**Returns:** Current QueryRunner or null if no active transaction

**Example:**
```typescript
const queryRunner = transactionService.getCurrentQueryRunner('myContext');
```

#### `getTransactionDepth(context: string): number`

Get the current nesting depth of transactions.

**Parameters:**
- `context`: Transaction context identifier

**Returns:** Depth (0 if no transaction)

**Example:**
```typescript
const depth = transactionService.getTransactionDepth('myContext');
if (depth > 3) {
  console.warn('Deep nesting detected');
}
```

#### `isTransactionTimedOut(context: string): boolean`

Check if the current transaction has exceeded its timeout.

**Parameters:**
- `context`: Transaction context identifier

**Returns:** true if timeout exceeded

**Example:**
```typescript
if (transactionService.isTransactionTimedOut('myContext')) {
  throw new Error('Transaction timeout exceeded');
}
```

#### `cleanup(context: string): Promise<void>`

Force cleanup of all transactions for a context. Should be called on request end.

**Parameters:**
- `context`: Transaction context identifier

**Example:**
```typescript
await transactionService.cleanup('myContext');
```

## Configuration Options

### TransactionOptions Interface

```typescript
interface TransactionOptions {
  isolationLevel?: 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';
  timeout?: number; // milliseconds
  readonly?: boolean;
  depth?: number;
}
```

**Options:**
- `isolationLevel`: PostgreSQL isolation level (default: READ COMMITTED)
- `timeout`: Maximum transaction duration in milliseconds (optional)
- `readonly`: Whether the transaction is read-only (future feature)
- `depth`: Internal tracking parameter

### Isolation Levels

- **READ UNCOMMITTED**: Lowest isolation, allows dirty reads (not fully supported by PostgreSQL)
- **READ COMMITTED**: Default, prevents dirty reads
- **REPEATABLE READ**: Prevents dirty reads and non-repeatable reads
- **SERIALIZABLE**: Highest isolation, fully serializable execution

## Best Practices

### 1. Use Context Identifiers Wisely

Create meaningful context identifiers that help with debugging:

```typescript
// ✅ Good: Descriptive and traceable
const contextId = `transfer:from_${accountId}:to_${toAccountId}:${Date.now()}`;

// ❌ Avoid: Too generic
const contextId = `transaction:${Math.random()}`;
```

### 2. Configure Appropriate Timeouts

Set timeouts based on expected operation duration:

```typescript
// ✅ Fast operation
await transactionService.execute(context, callback, { timeout: 1000 });

// ✅ Complex operation
await transactionService.execute(context, callback, { timeout: 30000 });

// ❌ Avoid: No timeout for long operations
await transactionService.execute(context, callback);
```

### 3. Choose Appropriate Isolation Levels

```typescript
// ✅ Financial transactions
isolationLevel: 'SERIALIZABLE'

// ✅ General operations
isolationLevel: 'READ COMMITTED'

// ✅ High-concurrency reads
isolationLevel: 'REPEATABLE READ'
```

### 4. Minimal Transaction Scope

Keep transactions as short as possible:

```typescript
// ✅ Good: Only critical operations in transaction
async createOrder(data: any) {
  // Validation outside transaction
  validateOrderData(data);

  return this.transactionService.execute(
    `order:${Date.now()}`,
    async (queryRunner) => {
      // Only database operations in transaction
      return queryRunner.manager.save(order);
    }
  );
}
```

### 5. Proper Error Handling

Always handle errors appropriately:

```typescript
try {
  await this.transactionService.commitTransaction(contextId);
} catch (error) {
  this.logger.error(`Transaction failed: ${error.message}`);
  // Handle error appropriately
  throw error;
}
```

### 6. Cleanup in Request Lifecycle

Ensure cleanup is called even if exceptions occur:

```typescript
// In a request interceptor or middleware
async use(req, res, next) {
  const contextId = `req:${req.id}:${Date.now()}`;
  
  try {
    // Process request
  } finally {
    // Always cleanup
    await this.transactionService.cleanup(contextId);
  }
}
```

## Error Handling

### Common Errors

**InternalServerErrorException: Failed to start transaction**
- Database connection failed
- Check database credentials and connectivity

**BadRequestException: No active transaction to commit**
- Attempting to commit a non-existent transaction
- Verify transaction context is correct

**Transaction timeout exceeded**
- Operation took longer than configured timeout
- Increase timeout or optimize operation

### Recovery Strategies

```typescript
async robustExecute<T>(
  context: string,
  callback: (queryRunner: QueryRunner) => Promise<T>,
  maxRetries: number = 3,
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await this.transactionService.execute(
        `${context}:attempt:${attempt}`,
        callback,
        { timeout: 5000 },
      );
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      // Wait before retry (exponential backoff)
      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, attempt) * 1000),
      );
    }
  }
}
```

## Debugging

Enable detailed logging:

```typescript
// In your service
private readonly logger = new Logger(YourService.name);

async myMethod() {
  const contextId = `myMethod:${Date.now()}`;
  
  console.log(`Transaction depth: ${this.transactionService.getTransactionDepth(contextId)}`);
  
  const result = await this.transactionService.execute(contextId, callback);
  
  console.log(`Transaction completed, depth: ${this.transactionService.getTransactionDepth(contextId)}`);
}
```

## Performance Considerations

1. **Connection Pooling**: Configured in database connection settings
2. **Transaction Duration**: Keep transactions short to avoid lock contention
3. **Isolation Levels**: Higher isolation levels have more overhead
4. **Nested Depth**: Excessive nesting can impact performance

## Testing

See `transaction.service.spec.ts` for comprehensive test examples.

### Testing a Transactional Service

```typescript
describe('TransactionalService', () => {
  let service: TransactionalService;
  let transactionService: TransactionService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [TransactionalService, TransactionService],
    }).compile();

    service = module.get(TransactionalService);
    transactionService = module.get(TransactionService);
  });

  it('should commit on success', async () => {
    await service.myMethod();
    // Verify results were persisted
  });

  it('should rollback on error', async () => {
    try {
      await service.failingMethod();
    } catch (error) {
      // Expected
    }
    // Verify no partial state was saved
  });
});
```

## Limitations and Future Improvements

- Current implementation is optimized for PostgreSQL
- Timeout is checked at commit time, not during execution
- Savepoint names are auto-generated and not exposed
- No query logging within transactions (future feature)

## Support and Troubleshooting

For issues:
1. Check transaction context identifiers are unique
2. Verify isolation level is appropriate for operation
3. Review timeout settings
4. Check database logs for deadlocks
5. Ensure proper cleanup in request lifecycle

## References

- [TypeORM Documentation](https://typeorm.io/)
- [PostgreSQL Transaction Documentation](https://www.postgresql.org/docs/current/tutorial-transactions.html)
- [NestJS Database Documentation](https://docs.nestjs.com/techniques/database)
