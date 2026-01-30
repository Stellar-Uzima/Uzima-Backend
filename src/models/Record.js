import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenantPlugin.js';
import encryptedFieldPlugin from './plugins/encryptedField.js';

const fileSchema = new mongoose.Schema({
  cid: {
    type: String,
    required: true,
    trim: true,
  },
  fileName: {
    type: String,
    required: true,
    trim: true,
  },
  fileType: {
    type: String,
    required: true,
    trim: true,
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
});

const recordSchema = new mongoose.Schema({
  patientName: {
    type: String,
    required: true,
    trim: true,
  },
  date: {
    type: Date,
    required: true,
    default: Date.now,
  },
  diagnosis: {
    type: String,
    required: true,
  },
  treatment: {
    type: String,
    required: true,
  },
  history: {
    type: String,
    required: false,
  },
  txHash: {
    type: String,
    required: true,
    unique: false,
  },
  clientUUID: {
    type: String,
    required: true,
    unique: false,
  },
  syncTimestamp: {
    type: Date,
    required: true,
  },
  files: [fileSchema],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  deletedAt: {
    type: Date,
    default: null,
    index: true,
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
});

recordSchema.plugin(encryptedFieldPlugin, { fields: ['diagnosis', 'treatment', 'history'] });

// Update the updatedAt timestamp before saving
recordSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

recordSchema.index({ tenantId: 1, clientUUID: 1, syncTimestamp: 1 }, { unique: true });
// Index for deletedAt
recordSchema.plugin(tenantPlugin);
recordSchema.index({ tenantId: 1, deletedAt: 1 });
// Compound index for createdBy and createdAt for efficient queries
recordSchema.index({ tenantId: 1, createdBy: 1, createdAt: -1 });
// Index for common query patterns
recordSchema.index({ tenantId: 1, patientName: 1, createdAt: -1 });
recordSchema.index({ tenantId: 1, txHash: 1 }, { unique: true });
// Text index for search functionality on diagnosis and treatment
recordSchema.index({
  patientName: 'text',
  diagnosis: 'text',
  treatment: 'text'
});

export default mongoose.model('Record', recordSchema);
