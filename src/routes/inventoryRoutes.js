import express from 'express';
import InventoryItem from '../models/InventoryItem.js';
import { logInventoryChange } from '../services/inventoryAudit.service.js';
// import { emitInventoryUpdate } from '../services/realtime.service.js'; // Commented out - file doesn't exist
import { checkAndNotifyLowStock } from '../services/inventoryAlert.service.js';

const router = express.Router();

// Create item
router.post('/', async (req, res) => {
  try {
    const item = await InventoryItem.create(req.body);
    await logInventoryChange({
      sku: item.sku,
      action: 'create',
      beforeQuantity: 0,
      afterQuantity: item.totalQuantity,
      delta: item.totalQuantity,
      metadata: { payload: req.body },
      performedBy: req.user?.id,
    });
    res.status(201).json({ success: true, data: item });
    // emitInventoryUpdate({ type: 'created', item }); // Commented out - realtime service doesn't exist
    await checkAndNotifyLowStock(item);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// List items
router.get('/', async (req, res) => {
  const items = await InventoryItem.find();
  res.json({ success: true, data: items });
});

// Get item by SKU
router.get('/:sku', async (req, res) => {
  const item = await InventoryItem.findOne({ sku: req.params.sku });
  if (!item) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: item });
});

// Update item metadata/threshold
router.patch('/:sku', async (req, res) => {
  const item = await InventoryItem.findOneAndUpdate(
    { sku: req.params.sku },
    { $set: { name: req.body.name, category: req.body.category, unit: req.body.unit, threshold: req.body.threshold, metadata: req.body.metadata } },
    { new: true }
  );
  if (!item) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: item });
  // emitInventoryUpdate({ type: 'updated', item }); // Commented out - realtime service doesn't exist
  await checkAndNotifyLowStock(item);
});

// Add stock to a lot (upsert by lotNumber)
router.post('/:sku/lots', async (req, res) => {
  const { lotNumber, quantity, expiryDate } = req.body;
  if (!lotNumber || typeof quantity !== 'number' || !expiryDate) {
    return res.status(400).json({ success: false, message: 'lotNumber, quantity, expiryDate required' });
  }
  const item = await InventoryItem.findOne({ sku: req.params.sku });
  if (!item) return res.status(404).json({ success: false, message: 'Not found' });

  const before = item.totalQuantity;
  const existing = item.lots.find(l => l.lotNumber === lotNumber);
  if (existing) {
    existing.quantity += quantity;
    existing.expiryDate = new Date(expiryDate);
  } else {
    item.lots.push({ lotNumber, quantity, expiryDate });
  }
  await item.save();

  await logInventoryChange({
    sku: item.sku,
    action: 'adjust_increase',
    beforeQuantity: before,
    afterQuantity: item.totalQuantity,
    delta: item.totalQuantity - before,
    lot: { lotNumber, expiryDate: new Date(expiryDate), quantityChanged: quantity },
    performedBy: req.user?.id,
  });

  res.status(201).json({ success: true, data: item });
  // emitInventoryUpdate({ type: 'lot_added', item }); // Commented out - realtime service doesn't exist
  await checkAndNotifyLowStock(item);
});

// Consume stock FIFO respecting expiry dates
router.post('/:sku/consume', async (req, res) => {
  try {
    const { quantity } = req.body;
    if (typeof quantity !== 'number' || quantity <= 0) {
      return res.status(400).json({ success: false, message: 'quantity must be > 0' });
    }
    const item = await InventoryItem.findOne({ sku: req.params.sku });
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });

    let remaining = quantity;
    const before = item.totalQuantity;
    const lotsConsumed = [];
    // lots are pre-sorted by expiry ascending in pre-save hook
    for (const lot of item.lots) {
      if (remaining <= 0) break;
      const usable = Math.min(lot.quantity, remaining);
      if (usable > 0) {
        lot.quantity -= usable;
        remaining -= usable;
        lotsConsumed.push({ lotNumber: lot.lotNumber, expiryDate: lot.expiryDate, quantityChanged: -usable });
      }
    }
    // Remove empty lots
    item.lots = item.lots.filter(l => l.quantity > 0);
    await item.save();

    if (remaining > 0) {
      return res.status(409).json({ success: false, message: 'Insufficient stock', data: { requested: quantity, fulfilled: quantity - remaining } });
    }

    await logInventoryChange({
      sku: item.sku,
      action: 'consume',
      beforeQuantity: before,
      afterQuantity: item.totalQuantity,
      delta: item.totalQuantity - before,
      lot: lotsConsumed.length === 1 ? lotsConsumed[0] : undefined,
      metadata: lotsConsumed.length > 1 ? { lots: lotsConsumed } : undefined,
      performedBy: req.user?.id,
    });

    res.json({ success: true, data: { item, lotsConsumed } });
    // emitInventoryUpdate({ type: 'consumed', item, lotsConsumed }); // Commented out - realtime service doesn't exist
    await checkAndNotifyLowStock(item);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;


