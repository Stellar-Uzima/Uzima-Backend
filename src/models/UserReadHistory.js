// Tracks which articles a user has read
const mongoose = require('mongoose');

const UserReadHistorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  articleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', required: true },
  readAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('UserReadHistory', UserReadHistorySchema);
