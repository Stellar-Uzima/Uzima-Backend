import mongoose from 'mongoose';
import softDeletePlugin from './plugins/softDeletePlugin.js';

const fileMetadataSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  filename: {
    type: String,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
    required: true
  },
  storageType: {
    type: String,
    enum: ['local', 's3', 'azure'],
    required: true
  },
  storagePath: {
    type: String,
    required: true
  },
  originalFilename: {
    type: String,
    required: false
  },
  tags: [{
    type: String
  }],
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  accessCount: {
    type: Number,
    default: 0
  },
  lastAccessedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for efficient querying by user
fileMetadataSchema.index({ uploadedBy: 1, createdAt: -1 });

// Index for efficient querying by storage type and path
fileMetadataSchema.index({ storageType: 1, storagePath: 1 });

// Index for efficient querying by tags
fileMetadataSchema.index({ tags: 1 });

// Apply soft delete plugin
fileMetadataSchema.plugin(softDeletePlugin);

export default mongoose.model('FileMetadata', fileMetadataSchema);