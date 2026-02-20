import mongoose from 'mongoose';

const idempotencyKeySchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    response: {
      statusCode: Number,
      body: mongoose.Schema.Types.Mixed,
      headers: mongoose.Schema.Types.Mixed,
    },
    // Automatically expire documents 24 hours after this date
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: '24h' },
    },
  },
  { timestamps: true }
);

export default mongoose.model('IdempotencyKey', idempotencyKeySchema);
