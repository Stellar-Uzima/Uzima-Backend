// Controller for updating articles engagement metrics
const Article = require('../models/Article');

// PATCH /api/articles/:id/engagement
exports.updateEngagement = async (req, res) => {
  try {
    const { id } = req.params;
    const { views, likes, shares } = req.body;
    const update = {};
    if (typeof views === 'number') update.views = views;
    if (typeof likes === 'number') update.likes = likes;
    if (typeof shares === 'number') update.shares = shares;
    const article = await Article.findByIdAndUpdate(id, { $inc: update }, { new: true });
    if (!article) return res.status(404).json({ error: 'Article not found' });
    res.json(article);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
