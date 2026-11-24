// SMS failure classification and notification pagination. Closes #1561, #1565.
const crypto = require('crypto');

const RETRYABLE_STATUS = [408, 429, 500, 502, 503, 504];
const RETRYABLE_CODES = ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND'];

// Classifies a provider error as retryable or terminal and attaches a trace id for logs.
function classifySmsFailure(err = {}) {
  const status = err.status || err.statusCode;
  const retryable = RETRYABLE_STATUS.includes(status) || RETRYABLE_CODES.includes(err.code);
  return {
    outcome: retryable ? 'retryable' : 'terminal',
    reason: err.code || status || 'unknown',
    traceId: crypto.randomBytes(8).toString('hex'),
  };
}

const MAX_PAGE_SIZE = 50;

// Builds a bounded, stably ordered query (newest first, id as tiebreaker).
function buildNotificationQuery(userId, { page = 1, limit = 20, unread, from, to } = {}) {
  const size = Math.min(Math.max(parseInt(limit, 10) || 20, 1), MAX_PAGE_SIZE);
  const current = Math.max(parseInt(page, 10) || 1, 1);
  const filter = { userId };
  if (unread === 'true' || unread === true) filter.read = false;
  if (from || to) filter.createdAt = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) };
  return { filter, sort: { createdAt: -1, _id: -1 }, skip: (current - 1) * size, limit: size, page: current };
}

const pageMeta = (total, { page, limit }) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
  hasNext: page * limit < total,
});

module.exports = { classifySmsFailure, buildNotificationQuery, pageMeta, MAX_PAGE_SIZE };
