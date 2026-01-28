// Assigns users to A/B test groups and logs metrics
const AbTestMetric = require('../models/AbTestMetric');

function assignGroup(userId) {
  // Simple hash for deterministic assignment
  return userId.toString().charCodeAt(0) % 2 === 0 ? 'A' : 'B';
}

async function logImpression(userId, group) {
  await AbTestMetric.findOneAndUpdate(
    { userId, group },
    { $inc: { impressions: 1 }, lastUpdated: new Date() },
    { upsert: true }
  );
}

async function logClick(userId, group) {
  await AbTestMetric.findOneAndUpdate(
    { userId, group },
    { $inc: { clicks: 1 }, lastUpdated: new Date() },
    { upsert: true }
  );
}

module.exports = { assignGroup, logImpression, logClick };
