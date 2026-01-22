// Stores A/B test groups and CTR metrics
const mongoose = require('mongoose');

const AbTestMetricSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  group: { type: String, enum: ['A', 'B'], required: true },
  impressions: { type: Number, default: 0 },
  clicks: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AbTestMetric', AbTestMetricSchema);
