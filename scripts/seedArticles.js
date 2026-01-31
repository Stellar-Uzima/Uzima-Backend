// Script to seed sample health articles
const mongoose = require('mongoose');
const Article = require('../models/Article');

const articles = [
  {
    title: 'Heart Health Basics',
    summary: 'Learn the essentials of keeping your heart healthy.',
    content:
      'A healthy heart is vital for overall well-being. This article covers diet, exercise, and lifestyle tips for cardiovascular health.',
    topics: ['cardiology'],
    tags: ['heart', 'wellness', 'prevention'],
    author: 'Dr. Amina Yusuf',
    imageUrl: 'https://example.com/images/heart.jpg',
    url: 'https://healthsite.com/articles/heart-health',
    publishedAt: new Date('2025-07-01'),
    views: 120,
    likes: 15,
    shares: 3,
  },
  {
    title: 'Managing Diabetes Effectively',
    summary: 'Tips and strategies for living well with diabetes.',
    content:
      'Diabetes management involves monitoring blood sugar, healthy eating, and regular checkups. Here’s how to stay on track.',
    topics: ['endocrinology'],
    tags: ['diabetes', 'nutrition', 'lifestyle'],
    author: 'Dr. John Kim',
    imageUrl: 'https://example.com/images/diabetes.jpg',
    url: 'https://healthsite.com/articles/diabetes-management',
    publishedAt: new Date('2025-06-15'),
    views: 90,
    likes: 10,
    shares: 2,
  },
  {
    title: 'Blood Pressure: What You Need to Know',
    summary: 'Understanding and controlling your blood pressure.',
    content:
      'High blood pressure can lead to serious health issues. Learn how to monitor and manage it effectively.',
    topics: ['cardiology'],
    tags: ['blood pressure', 'hypertension', 'monitoring'],
    author: 'Dr. Amina Yusuf',
    imageUrl: 'https://example.com/images/blood-pressure.jpg',
    url: 'https://healthsite.com/articles/blood-pressure',
    publishedAt: new Date('2025-07-10'),
    views: 75,
    likes: 8,
    shares: 1,
  },
  {
    title: 'Healthy Eating for All Ages',
    summary: 'Nutrition tips for children, adults, and seniors.',
    content:
      'Balanced nutrition is important at every stage of life. This article provides age-specific dietary advice.',
    topics: ['nutrition'],
    tags: ['diet', 'children', 'seniors'],
    author: 'Dr. Fatima Bello',
    imageUrl: 'https://example.com/images/nutrition.jpg',
    url: 'https://healthsite.com/articles/healthy-eating',
    publishedAt: new Date('2025-05-20'),
    views: 60,
    likes: 5,
    shares: 0,
  },
];

async function seed() {
  await mongoose.connect('mongodb://localhost:27017/uzima', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  await Article.deleteMany({});
  await Article.insertMany(articles);
  console.log('Sample articles seeded!');
  await mongoose.disconnect();
}

seed();
