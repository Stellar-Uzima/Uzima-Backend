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
 *
 * Idempotency keys must be stable identifiers derived from the originating
 * event or operation (e.g. `payment:<orderId>:capture`), never generated per
 * attempt, so that retried jobs resolve to the same key.
 *
 * If a matching key already exists, the operation is considered completed and
 * `work` is skipped; the function returns `undefined` in that case so callers
 * can treat reprocessing as a successful no-op rather than an error.
 *
 * The check and the `work` callback should run within the same transaction
 * (see `runAtomicMoneyMovement`) so that concurrent retries cannot both pass
 * the existence check.
 */
export async function withIdempotencyGuard<T>(
  manager: EntityManager,
  ledgerTable: string,
  idempotencyKey: string,
  work: () => Promise<T>,
): Promise<T | undefined> {
  if (!idempotencyKey || idempotencyKey.trim().length === 0) {
    throw new Error('Idempotency key must be a non-empty stable identifier');
  }

  const existing = await manager.query(
    `SELECT 1 FROM ${ledgerTable} WHERE idempotency_key = $1 LIMIT 1 FOR UPDATE`,
    [idempotencyKey],
  );
  if (existing.length > 0) {
    return undefined;
  }
  return work();
}
