import mongoose from 'mongoose';

const ProviderCursorSchema = new mongoose.Schema(
  {
    provider: { type: String, unique: true, required: true },
    cursor: { type: String },
    lastReconciledAt: { type: Date },
  },
  { timestamps: true }
);

const ProviderCursor = mongoose.model('ProviderCursor', ProviderCursorSchema);

export default ProviderCursor;
