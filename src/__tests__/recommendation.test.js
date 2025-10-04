// Integration test for recommendation API
const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const Article = require('../../models/Article');
const User = require('../models/User').default || require('../models/User');
const UserReadHistory = require('../../models/UserReadHistory');
const recommendationRoutes = require('../../routes/recommendationRoutes');

const app = express();
app.use(express.json());
app.use('/api/recommendations', recommendationRoutes);

let user;

beforeAll(async () => {
  await mongoose.connect('mongodb://localhost:27017/uzima_test', { useNewUrlParser: true, useUnifiedTopology: true });
  await Article.deleteMany({});
  await User.deleteMany({});
  await UserReadHistory.deleteMany({});

  user = await User.create({ username: 'testuser', email: 'test@example.com', password: 'pass', role: 'patient' });

  await Article.insertMany([
    { title: 'Heart Health', content: '...', topics: ['cardiology'], url: 'a1' },
    { title: 'Diabetes Care', content: '...', topics: ['endocrinology'], url: 'a2' },
    { title: 'Blood Pressure Tips', content: '...', topics: ['cardiology'], url: 'a3' },
    { title: 'Healthy Eating', content: '...', topics: ['nutrition'], url: 'a4' }
  ]);

  const readArticle = await Article.findOne({ topics: 'cardiology' });
  await UserReadHistory.create({ userId: user._id, articleId: readArticle._id });
});

afterAll(async () => {
  await mongoose.connection.close();
});

test('should recommend articles with similar topics', async () => {
  // Mock auth middleware
  app.use((req, res, next) => { req.user = user; next(); });

  const res = await request(app)
    .get('/api/recommendations')
    .set('Authorization', 'Bearer testtoken');

  expect(res.status).toBe(200);
  expect(res.body.recommendations.length).toBeGreaterThan(0);
  // Should recommend another cardiology article
  const cardiologyArticles = res.body.recommendations.filter(a => a.topics.includes('cardiology'));
  expect(cardiologyArticles.length).toBeGreaterThan(0);
});
