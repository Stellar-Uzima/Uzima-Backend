import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { WalletIdempotencyKey } from '../entities/wallet-idempotency-key.entity';

export interface IdempotencyClaim {
  userId: string;
  endpoint: string;
  idempotencyKey: string;
  requestId?: string | null;
  requestSnapshot: unknown;
}

export interface IdempotencyFinalize {
  responseSnapshot: unknown;
  transactionId?: string | null;
}

/**
 * Thrown when a concurrent request has already claimed the same idempotency
 * key inside its transaction; the whole transaction rolls back and the caller
 * replays the winner's stored response instead.
 */
export class IdempotencyClaimedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdempotencyClaimedError';
  }
}

/** Serializes a payload to a stable string so key order never matters. */
export function canonicalizeSnapshot(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) {
      return input.map(normalize);
    }
    if (input !== null && typeof input === 'object') {
      const source = input as Record<string, unknown>;
      return Object.keys(source)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = normalize(source[key]);
          return acc;
        }, {});
    }
    return input;
  };
  return JSON.stringify(normalize(value)) ?? 'null';
}

/**
 * Claims an idempotency key with an INSERT inside the caller's transaction.
 * Returns the new row id, or null when the key was already claimed (the
 * unique constraint makes concurrent claims lose with DO NOTHING semantics).
 */
export async function claimIdempotencyKey(
  manager: EntityManager,
  claim: IdempotencyClaim,
): Promise<string | null> {
  const rows: Array<{ id: string }> = await manager.query(
    `INSERT INTO "wallet_idempotency_keys"
       ("endpoint", "userId", "idempotencyKey", "requestId", "requestSnapshot")
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT ("userId", "endpoint", "idempotencyKey") DO NOTHING
     RETURNING "id"`,
    [
      claim.endpoint,
      claim.userId,
      claim.idempotencyKey,
      claim.requestId ?? null,
      claim.requestSnapshot ?? null,
    ],
  );
  return rows.length > 0 ? rows[0].id : null;
}

/**
 * Stores the response produced by a claimed operation in the same transaction
 * as the operation itself, so a claim never exists without its result.
 */
export async function finalizeIdempotencyKey(
  manager: EntityManager,
  id: string,
  finalize: IdempotencyFinalize,
): Promise<void> {
  await manager.query(
    `UPDATE "wallet_idempotency_keys"
     SET "responseSnapshot" = $2, "transactionId" = $3
     WHERE "id" = $1`,
    [id, finalize.responseSnapshot ?? null, finalize.transactionId ?? null],
  );
}

/**
 * Replays a previously stored result for a retry of an already accepted key.
 * Throws ConflictException when the key was used with different input or the
 * original request has not stored a response yet.
 */
export function resolveStoredResult<T>(
  row: WalletIdempotencyKey,
  currentRequest: unknown,
  operation: string,
): T {
  if (canonicalizeSnapshot(row.requestSnapshot) !== canonicalizeSnapshot(currentRequest)) {
    throw new ConflictException(
      `Idempotency key was already used with a different ${operation} payload`,
    );
  }
  if (!row.responseSnapshot) {
    throw new ConflictException(
      `The original ${operation} request is still being processed; retry with the same key`,
    );
  }
  return row.responseSnapshot as unknown as T;
}
