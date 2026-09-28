/**
 * Shared soft-delete helpers: entities keep a nullable `deletedAt` column
 * instead of being physically removed, preserving audit integrity.
 */
export interface SoftDeletable {
  deletedAt: Date | null;
}

export function markSoftDeleted<T extends SoftDeletable>(entity: T): T {
  entity.deletedAt = new Date();
  return entity;
}

export function isSoftDeleted(entity: SoftDeletable): boolean {
  return entity.deletedAt !== null;
}

/** Filter to exclude soft-deleted records from a normal (non-admin) result set. */
export function excludeSoftDeleted<T extends SoftDeletable>(entities: T[]): T[] {
  return entities.filter((entity) => !isSoftDeleted(entity));
}

/** Admin/audit flows use this to explicitly include soft-deleted records. */
export function includeSoftDeleted<T extends SoftDeletable>(entities: T[]): T[] {
  return entities;
}
