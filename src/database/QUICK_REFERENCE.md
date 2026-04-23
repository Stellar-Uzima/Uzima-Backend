# Transaction Service Quick Reference

## Installation & Setup

```typescript
// Add to your module
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [DatabaseModule],
})
export class YourModule {}
```

## Quick Start

### Basic Example (Recommended)
```typescript
@Injectable()
export class MyService {
  constructor(
    @Inject(DataSource) private dataSource: DataSource,
    @InjectTransaction() 
    private transactionService: TransactionService,
  ) {}

  async doSomething() {
    const contextId = `operation:${Date.now()}`;
    
    await this.transactionService.execute(
      contextId,
      async (queryRunner) => {
        // Your database operations here
        const user = queryRunner.manager.create(User, { name: 'John' });
        await queryRunner.manager.save(user);
      },
      { timeout: 5000 }
    );
  }
}
```

## Method Reference

| Method | Purpose | Example |
|--------|---------|---------|
| `execute()` | Run callback in transaction | `await service.execute(ctx, callback)` |
| `startTransaction()` | Begin transaction | `const qr = await service.startTransaction(ctx)` |
| `commitTransaction()` | Commit changes | `await service.commitTransaction(ctx)` |
| `rollbackTransaction()` | Rollback changes | `await service.rollbackTransaction(ctx)` |
| `cleanup()` | Force cleanup | `await service.cleanup(ctx)` |
| `getTransactionDepth()` | Check nesting level | `depth = service.getTransactionDepth(ctx)` |
| `getCurrentQueryRunner()` | Get current runner | `qr = service.getCurrentQueryRunner(ctx)` |
| `isTransactionTimedOut()` | Check timeout | `if (service.isTransactionTimedOut(ctx))` |

## Usage Patterns

### Pattern 1: Simple Callback (Best for simple operations)
```typescript
await transactionService.execute(
  `createUser:${Date.now()}`,
  async (queryRunner) => {
    const user = queryRunner.manager.create(User, userData);
    await queryRunner.manager.save(user);
  },
  { timeout: 3000 }
);
```

### Pattern 2: Manual Control (Best for complex operations)
```typescript
const contextId = `transfer:${Date.now()}`;
const qr = await transactionService.startTransaction(contextId);

try {
  await doStep1(qr);
  await doStep2(qr);
  await transactionService.commitTransaction(contextId);
} catch (error) {
  await transactionService.rollbackTransaction(contextId);
  throw error;
}
```

### Pattern 3: Nested Transactions (Automatic via savepoints)
```typescript
await transactionService.execute(
  contextId,
  async (qr) => {
    // Depth 0: Main transaction
    const parent = await createParent(qr);
    
    // Depth 1: Savepoint (automatic)
    const child = await createChild(qr, parent);
    
    return parent;
  }
);
```

## Configuration Options

```typescript
interface TransactionOptions {
  // Isolation level (default: READ COMMITTED)
  isolationLevel?: 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';
  
  // Timeout in milliseconds (optional)
  timeout?: number;
  
  // Read-only flag (future feature)
  readonly?: boolean;
}
```

## Isolation Levels (Common Use Cases)

| Level | Use Case | Concurrency | Safety |
|-------|----------|-------------|--------|
| READ COMMITTED | Default, most operations | High | Good |
| REPEATABLE READ | Reports, searches | Medium | Better |
| SERIALIZABLE | Financial, critical data | Low | Highest |

```typescript
// Financial transaction
{ isolationLevel: 'SERIALIZABLE', timeout: 10000 }

// Regular operation
{ isolationLevel: 'READ COMMITTED', timeout: 5000 }

// High-concurrency report
{ isolationLevel: 'REPEATABLE READ', timeout: 30000 }
```

## Timeout Recommendations

```typescript
// Fast operations (< 1 second)
timeout: 1000

// Normal operations (1-5 seconds)
timeout: 5000

// Batch operations (5-30 seconds)
timeout: 30000

// Complex operations (> 30 seconds - consider breaking up)
timeout: 60000
```

## Error Handling

```typescript
try {
  await transactionService.execute(contextId, callback);
} catch (error) {
  if (error instanceof ConflictException) {
    // Handle specific errors
  } else if (error.message.includes('timeout')) {
    // Handle timeout
  } else {
    // Handle general errors
  }
}
```

## Common Mistakes & Fixes

### ❌ Wrong: Using repository directly in transaction
```typescript
const user = await this.userRepository.save(userData);
```

### ✅ Correct: Use queryRunner.manager
```typescript
const user = await queryRunner.manager.save(userData);
```

---

### ❌ Wrong: No timeout
```typescript
await transactionService.execute(ctx, callback);
```

### ✅ Correct: Always set timeout
```typescript
await transactionService.execute(ctx, callback, { timeout: 5000 });
```

---

### ❌ Wrong: Manual commit/rollback with callback
```typescript
await transactionService.execute(ctx, async (qr) => {
  await queryRunner.commitTransaction(); // ❌ Wrong
});
```

### ✅ Correct: Let execute() handle it
```typescript
await transactionService.execute(ctx, async (qr) => {
  // Just do your operations, commit is automatic
});
```

---

### ❌ Wrong: Same context for concurrent operations
```typescript
const ctx = 'operation';
Promise.all([
  service.execute(ctx, callback1),  // ❌ Shared context
  service.execute(ctx, callback2),
]);
```

### ✅ Correct: Unique context per operation
```typescript
Promise.all([
  service.execute(`op1:${Date.now()}`, callback1),
  service.execute(`op2:${Date.now()}`, callback2),
]);
```

## Debugging Tips

```typescript
// 1. Check transaction depth
const depth = transactionService.getTransactionDepth(contextId);
console.log(`Transaction depth: ${depth}`);

// 2. Check if timed out
if (transactionService.isTransactionTimedOut(contextId)) {
  console.log('Transaction timed out');
}

// 3. Get current query runner
const qr = transactionService.getCurrentQueryRunner(contextId);
console.log(`Current runner: ${qr ? 'Active' : 'None'}`);

// 4. Force cleanup
await transactionService.cleanup(contextId);
```

## Performance Considerations

- ✅ Keep transactions short
- ✅ Minimize nested depth (< 3 levels)
- ✅ Use appropriate timeout
- ✅ Choose isolation level carefully
- ❌ Don't do external API calls in transaction
- ❌ Don't use complex queries in transaction
- ❌ Don't create many nested transactions

## Integration With Request Lifecycle

```typescript
// Middleware/Interceptor
async use(req, res, next) {
  const contextId = `req:${req.id}:${Date.now()}`;
  req.transactionContext = contextId;
  
  try {
    next();
  } finally {
    await transactionService.cleanup(contextId);
  }
}
```

## Testing

```typescript
it('should rollback on error', async () => {
  try {
    await service.failingMethod();
  } catch {}
  
  // Verify data was rolled back
  const user = await userRepository.findOne({ where: { id } });
  expect(user).toBeUndefined();
});
```

## Files & Documentation

- **Main Service**: `src/database/services/transaction.service.ts`
- **Unit Tests**: `src/database/services/transaction.service.spec.ts`
- **Full Docs**: `src/database/TRANSACTIONS.md`
- **Examples**: `src/database/services/transaction.examples.ts`
- **Integration Guide**: `src/database/INTEGRATION_GUIDE.md`
- **Service Example**: `src/database/services/user-service.example.ts`

## Getting Help

1. Check `TRANSACTIONS.md` for detailed documentation
2. Review examples in `transaction.examples.ts`
3. See `INTEGRATION_GUIDE.md` for refactoring tips
4. Look at `user-service.example.ts` for real-world usage
5. Check unit tests for additional patterns

## Key Takeaways

1. Always use `transactionService.execute()` for simple operations
2. Always set a timeout
3. Use `queryRunner.manager` instead of repositories inside transactions
4. Nested transactions are handled automatically via savepoints
5. Cleanup is automatic with `execute()`, but manual for `startTransaction()`
6. Context IDs should be unique per operation
7. Keep transactions as short as possible
8. Test error scenarios (rollback cases)
