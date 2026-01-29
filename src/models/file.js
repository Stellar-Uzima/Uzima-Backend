import mongoose from 'mongoose';

const fileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    key: {
      type: String,
      required: true,
      unique: true,
    },
    filename: {
      type: String,
      required: true,
    },
    originalFilename: {
      type: String,
      required: true,
    },
    sanitizedFilename: {
      type: String,
      required: true,
    },
    contentType: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'scanning', 'clean', 'infected', 'quarantined'],
      default: 'pending',
      index: true,
    },
    mimeTypeVerified: {
      type: Boolean,
      default: false,
      index: true,
    },
    signatureValid: {
      type: Boolean,
      default: false,
      index: true,
    },
    signatureValidationResult: {
      valid: Boolean,
      detectedType: String,
      error: String,
      threat: String,
      validatedAt: Date,
    },
    scanResult: {
      scannedAt: Date,
      scanner: String,
      threats: [String],
      details: mongoose.Schema.Types.Mixed,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    lastAccessedAt: Date,
    metadata: mongoose.Schema.Types.Mixed,
  },
  {
    timestamps: true,
  }
);

// Index for querying user files
fileSchema.index({ userId: 1, status: 1, createdAt: -1 });
fileSchema.index({ mimeTypeVerified: 1, signatureValid: 1 });

export default mongoose.model('File', fileSchema);
