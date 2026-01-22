// Recommendation logic (content-based filtering)
const UserReadHistory = require('../models/UserReadHistory');
const Article = require('../models/Article');


async function getRecommendedArticles(userId, limit = 10, skip = 0) {
  // Get articles user has read
  const readHistory = await UserReadHistory.find({ userId }).select('articleId');
  const readArticleIds = readHistory.map(r => r.articleId);

  // Get topics and tags from read articles
  const readArticles = await Article.find({ _id: { $in: readArticleIds } });
  const topics = [...new Set(readArticles.flatMap(a => a.topics))];
  const tags = [...new Set(readArticles.flatMap(a => a.tags || []))];

  // Recommend articles with similar topics or tags, not already read
  // Rank by engagement (likes, views, shares) and recency
  const recommendations = await Article.find({
    $and: [
      { _id: { $nin: readArticleIds } },
      {
        $or: [
          { topics: { $in: topics } },
          { tags: { $in: tags } }
        ]
      }
    ]
  })
    .sort({ likes: -1, views: -1, shares: -1, publishedAt: -1 })
    .skip(skip)
    .limit(limit)
    .select('title summary url imageUrl author topics tags publishedAt likes views shares');

  return recommendations;
}

module.exports = { getRecommendedArticles };
