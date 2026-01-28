import InventoryItem from '../models/InventoryItem.js';
// import { emitLowStockAlert } from './realtime.service.js'; // Commented out - file doesn't exist

export function isLowStock(item) {
  const threshold = typeof item.threshold === 'number' ? item.threshold : 0;
  return item.totalQuantity <= threshold && threshold > 0;
}

export async function checkAndNotifyLowStock(item) {
  if (isLowStock(item)) {
    const payload = {
      sku: item.sku,
      name: item.name,
      totalQuantity: item.totalQuantity,
      threshold: item.threshold,
      lots: item.lots,
      timestamp: new Date().toISOString(),
    };
    // emitLowStockAlert(payload); // Commented out - realtime service doesn't exist
  }
}
