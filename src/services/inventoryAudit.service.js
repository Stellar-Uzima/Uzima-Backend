import InventoryAuditLog from '../models/InventoryAuditLog.js';

export async function logInventoryChange({
  sku,
  action,
  beforeQuantity,
  afterQuantity,
  delta,
  lot,
  metadata,
  performedBy,
  source = 'api',
}) {
  const entry = new InventoryAuditLog({
    sku,
    action,
    change: { beforeQuantity, afterQuantity, delta },
    lot,
    metadata,
    performedBy: performedBy || undefined,
    source,
  });
  await entry.save();
  return entry;
}
