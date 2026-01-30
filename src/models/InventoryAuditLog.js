import mongoose from 'mongoose';

const InventoryAuditLogSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, index: true },
    action: {
      type: String,
      required: true,
      enum: ['create', 'update', 'adjust_increase', 'adjust_decrease', 'consume', 'reconcile'],
    },
    change: {
      beforeQuantity: { type: Number, default: null },
      afterQuantity: { type: Number, default: null },
      delta: { type: Number, default: null },
    },
    lot: {
      lotNumber: { type: String },
      expiryDate: { type: Date },
      quantityChanged: { type: Number },
    },
    metadata: { type: mongoose.Schema.Types.Mixed },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    source: { type: String, enum: ['api', 'job', 'system'], default: 'api' },
  },
  { timestamps: true }
);

export default mongoose.model('InventoryAuditLog', InventoryAuditLogSchema);
