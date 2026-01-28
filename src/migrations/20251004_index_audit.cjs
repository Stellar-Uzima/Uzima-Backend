module.exports = {
  async up(db /*, client */) {
    const ops = [];
    try {
      // Users
      ops.push(db.collection('users').createIndex({ email: 1 }, { unique: true }));
      ops.push(db.collection('users').createIndex({ createdAt: -1 }));

      // Transactions (if exists)
      ops.push(db.collection('transactions').createIndex({ userId: 1, createdAt: -1 }));
      ops.push(db.collection('transactions').createIndex({ status: 1 }));

      await Promise.allSettled(ops);
    } catch (e) {
      // Best-effort: surface non-existence errors only if they are not namespace errors
      console.warn('Index audit migration encountered an issue:', e.message);
    }
  },

  async down(db /*, client */) {
    // Optionally drop indexes; keep no-op to preserve performance indexes
    return null;
  },
};
