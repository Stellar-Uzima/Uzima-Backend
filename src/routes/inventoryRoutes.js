import express from 'express';
import InventoryItem from '../models/InventoryItem.js';
import { logInventoryChange } from '../services/inventoryAudit.service.js';
import { checkAndNotifyLowStock } from '../services/inventoryAlert.service.js';

// Optional realtime service (may not exist)
let emitInventoryUpdate;
try {
  const realtimeModule = await import('../services/realtime.service.js');
  emitInventoryUpdate = realtimeModule.emitInventoryUpdate || (() => { });
} catch (e) {
  emitInventoryUpdate = () => { }; // No-op if service doesn't exist
}

const router = express.Router();

/**
 * @swagger
 * /api/inventory:
 *   post:
 *     summary: Create inventory item
 *     description: Create a new inventory item with initial stock details
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sku
 *               - name
 *             properties:
 *               sku:
 *                 type: string
 *                 example: "MED-001"
 *               name:
 *                 type: string
 *                 example: "Paracetamol 500mg"
 *               category:
 *                 type: string
 *                 example: "Pain Relief"
 *               unit:
 *                 type: string
 *                 example: "tablets"
 *               threshold:
 *                 type: number
 *                 example: 100
 *                 description: Low stock alert threshold
 *               lots:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     lotNumber:
 *                       type: string
 *                     quantity:
 *                       type: number
 *                     expiryDate:
 *                       type: string
 *                       format: date-time
 *     responses:
 *       201:
 *         description: Item created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/InventoryItem'
 *       400:
 *         description: Validation error
 */
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
    emitInventoryUpdate({ type: 'created', item });
    await checkAndNotifyLowStock(item);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * @swagger
 * /api/inventory:
 *   get:
 *     summary: List all inventory items
 *     description: Retrieve a list of all inventory items
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Items retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/InventoryItem'
 */
// List items
router.get('/', async (req, res) => {
  const items = await InventoryItem.find();
  res.json({ success: true, data: items });
});

/**
 * @swagger
 * /api/inventory/{sku}:
 *   get:
 *     summary: Get inventory item by SKU
 *     description: Retrieve a specific inventory item by its SKU
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sku
 *         required: true
 *         schema:
 *           type: string
 *         description: Item SKU
 *         example: "MED-001"
 *     responses:
 *       200:
 *         description: Item retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/InventoryItem'
 *       404:
 *         description: Item not found
 */
// Get item by SKU
router.get('/:sku', async (req, res) => {
  const item = await InventoryItem.findOne({ sku: req.params.sku });
  if (!item) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: item });
});

/**
 * @swagger
 * /api/inventory/{sku}:
 *   patch:
 *     summary: Update inventory item
 *     description: Update metadata, threshold, or other details of an inventory item
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sku
 *         required: true
 *         schema:
 *           type: string
 *         description: Item SKU
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               category:
 *                 type: string
 *               unit:
 *                 type: string
 *               threshold:
 *                 type: number
 *               metadata:
 *                 type: object
 *     responses:
 *       200:
 *         description: Item updated successfully
 *       404:
 *         description: Item not found
 */
// Update item metadata/threshold
router.patch('/:sku', async (req, res) => {
  const item = await InventoryItem.findOneAndUpdate(
    { sku: req.params.sku },
    { $set: { name: req.body.name, category: req.body.category, unit: req.body.unit, threshold: req.body.threshold, metadata: req.body.metadata } },
    { new: true }
  );
  if (!item) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: item });
  emitInventoryUpdate({ type: 'updated', item });
  await checkAndNotifyLowStock(item);
});

/**
 * @swagger
 * /api/inventory/{sku}/lots:
 *   post:
 *     summary: Add stock lot
 *     description: Add a new lot of stock to an inventory item
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sku
 *         required: true
 *         schema:
 *           type: string
 *         description: Item SKU
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - lotNumber
 *               - quantity
 *               - expiryDate
 *             properties:
 *               lotNumber:
 *                 type: string
 *                 example: "LOT-2024-001"
 *               quantity:
 *                 type: number
 *                 example: 100
 *               expiryDate:
 *                 type: string
 *                 format: date-time
 *                 example: "2025-12-31T00:00:00Z"
 *     responses:
 *       201:
 *         description: Lot added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/InventoryItem'
 *       400:
 *         description: Missing required fields
 *       404:
 *         description: Item not found
 */
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
  emitInventoryUpdate({ type: 'lot_added', item });
  await checkAndNotifyLowStock(item);
});

/**
 * @swagger
 * /api/inventory/{sku}/consume:
 *   post:
 *     summary: Consume stock (FIFO)
 *     description: Consume stock from an inventory item using FIFO (First In, First Out) based on expiry dates
 *     tags: [Inventory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sku
 *         required: true
 *         schema:
 *           type: string
 *         description: Item SKU
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - quantity
 *             properties:
 *               quantity:
 *                 type: number
 *                 minimum: 1
 *                 example: 10
 *                 description: Quantity to consume
 *     responses:
 *       200:
 *         description: Stock consumed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     item:
 *                       $ref: '#/components/schemas/InventoryItem'
 *                     lotsConsumed:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           lotNumber:
 *                             type: string
 *                           quantityChanged:
 *                             type: number
 *       400:
 *         description: Invalid quantity
 *       404:
 *         description: Item not found
 *       409:
 *         description: Insufficient stock
 */
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
    emitInventoryUpdate({ type: 'consumed', item, lotsConsumed });
    await checkAndNotifyLowStock(item);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;


