import mongoose from 'mongoose';
import softDeletePlugin from './plugins/softDeletePlugin.js';

const InventoryLotSchema = new mongoose.Schema(
  {
    lotNumber: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    expiryDate: { type: Date, required: true },
    receivedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const InventoryItemSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    category: { type: String },
    unit: { type: String, default: 'unit' },
    threshold: { type: Number, default: 0 },
    lots: { type: [InventoryLotSchema], default: [] },
    totalQuantity: { type: Number, required: true, min: 0, default: 0 },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

// Compute totalQuantity and maintain lots ordered by FIFO (earliest expiry first)
InventoryItemSchema.pre('save', function computeTotals(next) {
  if (Array.isArray(this.lots)) {
    this.lots.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
    this.totalQuantity = this.lots.reduce((sum, lot) => sum + (lot.quantity || 0), 0);
  }
  next();
});

// Additional indexes for performance optimization
InventoryItemSchema.index({ name: 1 });
InventoryItemSchema.index({ category: 1, totalQuantity: 1 });
InventoryItemSchema.index({ totalQuantity: 1, threshold: 1 });
// Text index for search functionality
InventoryItemSchema.index({
  name: 'text',
  category: 'text',
  sku: 'text'
});

// Apply soft delete plugin
InventoryItemSchema.plugin(softDeletePlugin);

export default mongoose.model('InventoryItem', InventoryItemSchema);
