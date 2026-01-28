// Articles model for health articles with topic tags
const mongoose = require('mongoose');

const ArticleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  summary: { type: String }, // Short summary for previews
  content: { type: String, required: true },
  topics: [{ type: String, index: true }],
  tags: [{ type: String }], // Additional tags for flexible filtering
  author: { type: String },
  imageUrl: { type: String }, // For article thumbnails
  url: { type: String },
  publishedAt: { type: Date, default: Date.now },
  // Engagement metrics for analytics and ranking
  views: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  shares: { type: Number, default: 0 },
  // For future: language, reading time, etc.
});

module.exports = mongoose.model('Article', ArticleSchema);
