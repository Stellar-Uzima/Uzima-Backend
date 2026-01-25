// models/EmailBounce.js
const mongoose = require('mongoose');

const emailBounceSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['hard', 'soft', 'spam_complaint', 'unsubscribe'],
      required: true,
      index: true,
    },
    reason: {
      type: String,
      required: true,
    },
    bounceCount: {
      type: Number,
      default: 1,
    },
    isBlacklisted: {
      type: Boolean,
      default: false,
      index: true,
    },
    provider: {
      type: String,
      enum: ['sendgrid', 'ses', 'other'],
      default: 'other',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    lastBounceAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries
emailBounceSchema.index({ email: 1, type: 1 });
emailBounceSchema.index({ createdAt: -1 });

// Method to check if email is deliverable
emailBounceSchema.statics.isDeliverable = async function (email) {
  const bounce = await this.findOne({
    email: email.toLowerCase(),
    $or: [{ type: 'hard' }, { isBlacklisted: true }],
  });
  return !bounce;
};

// Method to get bounce statistics
emailBounceSchema.statics.getBounceStats = async function (hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const stats = await this.aggregate([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        emails: { $addToSet: '$email' },
      },
    },
  ]);

  return {
    timeframe: `${hours} hours`,
    stats: stats.map(s => ({
      type: s._id,
      count: s.count,
      uniqueEmails: s.emails.length,
    })),
    totalBounces: stats.reduce((sum, s) => sum + s.count, 0),
  };
};

const EmailBounce = mongoose.model('EmailBounce', emailBounceSchema);

export default EmailBounce;
