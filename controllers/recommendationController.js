const { logClick } = require('../services/abTestService');

// POST /api/recommendations/abtest/click { articleId, group }
exports.logAbTestClick = async (req, res) => {
  try {
    const userId = req.user._id;
    const { group } = req.body;
    await logClick(userId, group);
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
// Controller for recommendations API
const { getRecommendedArticles } = require('../services/recommendationService');
const { assignGroup, logImpression } = require('../services/abTestService');
const User = require('../src/models/User');

// GET /api/recommendations?page=1&limit=10
exports.getRecommendations = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Check opt-out
    const user = await User.findById(userId);
    if (user.recommendationsOptOut) {
      return res.status(200).json({ recommendations: [], optOut: true });
    }

    // Assign A/B group and log impression
    const group = assignGroup(userId);
    await logImpression(userId, group);

    // Get recommendations
    const recommendations = await getRecommendedArticles(userId, limit, skip);
    res.status(200).json({ recommendations, optOut: false, group });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/recommendations/optout { optOut: true/false }
exports.setOptOut = async (req, res) => {
  try {
    const userId = req.user._id;
    const { optOut } = req.body;
    await User.findByIdAndUpdate(userId, { recommendationsOptOut: !!optOut });
    res.status(200).json({ success: true, optOut: !!optOut });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
