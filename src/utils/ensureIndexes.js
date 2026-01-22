const mongoose = require("mongoose");

async function ensureIndexes() {
  const models = mongoose.models;
  const tasks = [];

  if (models.User) {
    tasks.push(
      models.User.collection.createIndex({ email: 1 }, { unique: true }),
      models.User.collection.createIndex({ createdAt: -1 })
    );
  }

  if (models.Transaction) {
    tasks.push(
      models.Transaction.collection.createIndex({ userId: 1, createdAt: -1 }),
      models.Transaction.collection.createIndex({ status: 1 })
    );
  }

  await Promise.all(tasks);
  console.log("✅ Index audit complete.");
}

module.exports = ensureIndexes;
