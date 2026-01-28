import mongoose from 'mongoose';

/**
 * Run a function within a MongoDB transaction using Mongoose sessions.
 * Ensures session is always ended. Keep the callback DB-only and short lived.
 *
 * @param {Function} fn - async (session) => { ... }
 * @param {Object} options - optional transaction options
 * @returns {Promise<*>} - returns whatever fn returns
 */
export async function withTransaction(fn, options = {}) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(
      async () => {
        result = await fn(session);
      },
      {
        // sensible defaults; callers can override by passing options
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        ...options,
      }
    );
    return result;
  } finally {
    await session.endSession();
  }
}

export default withTransaction;
