import { DataSource, EntityManager } from 'typeorm';

/**
 * Runs a balance/ledger-mutating callback inside a single DB transaction so
 * partial writes can never leave an account in an inconsistent state.
 * On any thrown error the transaction is rolled back and the error re-thrown.
 */
export async function runAtomicMoneyMovement<T>(
  dataSource: DataSource,
  work: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  return dataSource.transaction('SERIALIZABLE', async (manager) => {
    return work(manager);
  });
}

/**
 * Guards against double posting the same financial operation by checking
 * an idempotency key against a ledger-style repository before running `work`.
 */
export async function withIdempotencyGuard<T>(
  manager: EntityManager,
  ledgerTable: string,
  idempotencyKey: string,
  work: () => Promise<T>,
): Promise<T> {
  const existing = await manager.query(
    `SELECT 1 FROM ${ledgerTable} WHERE idempotency_key = $1 LIMIT 1`,
    [idempotencyKey],
  );
  if (existing.length > 0) {
    throw new Error(`Duplicate financial operation: ${idempotencyKey}`);
  }
  return work();
}
