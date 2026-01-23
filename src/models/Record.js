import mongoose from 'mongoose';
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
    unique: true,
  },
  clientUUID: {
    type: String,
    required: true,
    unique: true,
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

// Create compound index for clientUUID and syncTimestamp
recordSchema.index({ clientUUID: 1, syncTimestamp: 1 }, { unique: true });
// Index for deletedAt
recordSchema.index({ deletedAt: 1 });

export default mongoose.model('Record', recordSchema);
