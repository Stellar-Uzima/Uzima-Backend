import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../index.js';
import User from '../models/User.js';

// Mock OAuth providers
vi.mock('passport', () => ({
  authenticate: (provider, options) => (req, res, next) => {
    // Mock successful OAuth authentication for testing
    if (options.session === false) {
      return (req, res, next) => {
        req.user = {
          _id: '507f1f77bcf86cd799439011',
          email: 'test@example.com',
          role: 'patient',
        };
        next();
      };
    }
    return next();
  },
}));

describe('OAuth Authentication', () => {
  beforeEach(async () => {
    // Clear database before each test
    await User.deleteMany({});
  });

  afterEach(async () => {
    // Clean up after each test
    await User.deleteMany({});
  });

  describe('GET /api/auth/providers', () => {
    it('should return list of enabled OAuth providers', async () => {
      const response = await request(app).get('/api/auth/providers').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.providers).toBeInstanceOf(Array);
      expect(response.body.data.oauthUrls).toBeInstanceOf(Object);
    });
  });

  describe('OAuth Authentication Routes', () => {
    it('should redirect to Google OAuth', async () => {
      const response = await request(app).get('/api/auth/google').expect(302);

      // Should redirect to Google OAuth
      expect(response.headers.location).toBeDefined();
    });

    it('should redirect to GitHub OAuth', async () => {
      const response = await request(app).get('/api/auth/github').expect(302);

      // Should redirect to GitHub OAuth
      expect(response.headers.location).toBeDefined();
    });

    it('should redirect to Microsoft OAuth', async () => {
      const response = await request(app).get('/api/auth/microsoft').expect(302);

      // Should redirect to Microsoft OAuth
      expect(response.headers.location).toBeDefined();
    });
  });

  describe('OAuth Callback Routes', () => {
    it('should handle Google OAuth callback', async () => {
      // Mock the callback with query parameters
      const response = await request(app)
        .get('/api/auth/google/callback?code=test-code&state=test-state')
        .expect(302);

      // Should redirect to frontend with tokens
      expect(response.headers.location).toBeDefined();
      expect(response.headers.location).toContain(
        process.env.FRONTEND_URL || 'http://localhost:3000'
      );
    });

    it('should handle GitHub OAuth callback', async () => {
      const response = await request(app)
        .get('/api/auth/github/callback?code=test-code&state=test-state')
        .expect(302);

      // Should redirect to frontend with tokens
      expect(response.headers.location).toBeDefined();
      expect(response.headers.location).toContain(
        process.env.FRONTEND_URL || 'http://localhost:3000'
      );
    });

    it('should handle Microsoft OAuth callback', async () => {
      const response = await request(app)
        .get('/api/auth/microsoft/callback?code=test-code&state=test-state')
        .expect(302);

      // Should redirect to frontend with tokens
      expect(response.headers.location).toBeDefined();
      expect(response.headers.location).toContain(
        process.env.FRONTEND_URL || 'http://localhost:3000'
      );
    });
  });

  describe('Protected OAuth Routes', () => {
    let authToken;
    let testUser;

    beforeEach(async () => {
      // Create a test user and get auth token
      testUser = new User({
        username: 'testuser',
        email: 'test@example.com',
        password: 'hashedpassword',
        role: 'patient',
        oauthAccounts: {
          google: {
            id: '123456789',
            email: 'test@example.com',
            name: 'Test User',
            linkedAt: new Date(),
          },
        },
      });
      await testUser.save();

      // Mock JWT token
      authToken = 'Bearer mock-jwt-token';
    });

    describe('GET /api/auth/accounts', () => {
      it('should return linked OAuth accounts', async () => {
        const response = await request(app)
          .get('/api/auth/accounts')
          .set('Authorization', authToken)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.body.data.length).toBeGreaterThan(0);
        expect(response.body.data[0]).toHaveProperty('provider');
        expect(response.body.data[0]).toHaveProperty('email');
      });
    });

    describe('GET /api/auth/status', () => {
      it('should return OAuth status', async () => {
        const response = await request(app)
          .get('/api/auth/status')
          .set('Authorization', authToken)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('isOAuthUser');
        expect(response.body.data).toHaveProperty('linkedProviders');
        expect(response.body.data).toHaveProperty('hasPassword');
      });
    });

    describe('DELETE /api/auth/unlink/:provider', () => {
      it('should unlink OAuth account', async () => {
        const response = await request(app)
          .delete('/api/auth/unlink/google')
          .set('Authorization', authToken)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toContain('unlinked successfully');
      });

      it('should return error when trying to unlink non-existent provider', async () => {
        const response = await request(app)
          .delete('/api/auth/unlink/nonexistent')
          .set('Authorization', authToken)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toContain('not linked');
      });
    });

    describe('POST /api/auth/refresh/:provider', () => {
      it('should refresh OAuth token', async () => {
        const response = await request(app)
          .post('/api/auth/refresh/google')
          .set('Authorization', authToken)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('provider', 'google');
      });
    });
  });

  describe('User Model OAuth Methods', () => {
    let testUser;

    beforeEach(async () => {
      testUser = new User({
        username: 'testuser',
        email: 'test@example.com',
        password: 'hashedpassword',
        role: 'patient',
      });
      await testUser.save();
    });

    it('should link OAuth account', async () => {
      const profileData = {
        id: '123456789',
        email: 'oauth@example.com',
        name: 'OAuth User',
        avatar: 'https://example.com/avatar.jpg',
      };

      await testUser.linkOAuthAccount('google', profileData);

      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.oauthAccounts.google).toBeDefined();
      expect(updatedUser.oauthAccounts.google.id).toBe('123456789');
      expect(updatedUser.oauthAccounts.google.email).toBe('oauth@example.com');
    });

    it('should unlink OAuth account', async () => {
      // First link an account
      await testUser.linkOAuthAccount('google', {
        id: '123456789',
        email: 'oauth@example.com',
        name: 'OAuth User',
      });

      // Then unlink it
      await testUser.unlinkOAuthAccount('google');

      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.oauthAccounts.google).toBeUndefined();
    });

    it('should get OAuth providers', async () => {
      await testUser.linkOAuthAccount('google', {
        id: '123456789',
        email: 'oauth@example.com',
        name: 'OAuth User',
      });

      await testUser.linkOAuthAccount('github', {
        id: '987654321',
        username: 'testuser',
        email: 'github@example.com',
        name: 'GitHub User',
      });

      const providers = testUser.getOAuthProviders();
      expect(providers).toHaveLength(2);
      expect(providers[0].provider).toBe('google');
      expect(providers[1].provider).toBe('github');
    });

    it('should check if user has OAuth provider', async () => {
      await testUser.linkOAuthAccount('google', {
        id: '123456789',
        email: 'oauth@example.com',
        name: 'OAuth User',
      });

      expect(testUser.hasOAuthProvider('google')).toBe(true);
      expect(testUser.hasOAuthProvider('github')).toBe(false);
    });

    it('should check if user is OAuth user', async () => {
      expect(testUser.isOAuthUser()).toBe(false);

      await testUser.linkOAuthAccount('google', {
        id: '123456789',
        email: 'oauth@example.com',
        name: 'OAuth User',
      });

      expect(testUser.isOAuthUser()).toBe(true);
    });
  });

  describe('Static User Model Methods', () => {
    beforeEach(async () => {
      // Create users with OAuth accounts
      const user1 = new User({
        username: 'user1',
        email: 'user1@example.com',
        role: 'patient',
        oauthAccounts: {
          google: {
            id: 'google123',
            email: 'user1@example.com',
            name: 'User One',
          },
        },
      });

      const user2 = new User({
        username: 'user2',
        email: 'user2@example.com',
        role: 'patient',
        oauthAccounts: {
          github: {
            id: 'github456',
            username: 'user2',
            email: 'user2@example.com',
            name: 'User Two',
          },
        },
      });

      await user1.save();
      await user2.save();
    });

    it('should find user by OAuth provider and ID', async () => {
      const user = await User.findByOAuthProvider('google', 'google123');
      expect(user).toBeDefined();
      expect(user.email).toBe('user1@example.com');
    });

    it('should find user by OAuth email', async () => {
      const user = await User.findByOAuthEmail('github', 'user2@example.com');
      expect(user).toBeDefined();
      expect(user.username).toBe('user2');
    });
  });
});
