/**
 * Configuration System Tests
 * 
 * Tests for the unified environment configuration loader.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dotenv before importing config
vi.mock('dotenv', () => ({
  default: {
    config: vi.fn(),
  },
  config: vi.fn(),
}));

describe('Configuration System', () => {
  const originalEnv = { ...process.env };
  
  beforeEach(() => {
    // Reset process.env before each test
    process.env = { ...originalEnv };
    
    // Reset module cache to re-import config with fresh state
    vi.resetModules();
  });
  
  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });
  
  describe('Environment Detection', () => {
    it('should default to development when NODE_ENV is not set', async () => {
      delete process.env.NODE_ENV;
      process.env.MONGO_URI = 'mongodb://localhost:27017/test';
      process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long';
      
      const { getConfig, resetConfig } = await import('../config/index.js');
      resetConfig();
      
      const config = getConfig();
      expect(config.server.env).toBe('development');
    });
    
    it('should detect production environment', async () => {
      process.env.NODE_ENV = 'production';
      process.env.MONGO_URI = 'mongodb://localhost:27017/test';
      process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long';
      
      const { getConfig, resetConfig } = await import('../config/index.js');
      resetConfig();
      
      const config = getConfig();
      expect(config.server.env).toBe('production');
    });
    
    it('should detect staging environment', async () => {
      process.env.NODE_ENV = 'staging';
      process.env.MONGO_URI = 'mongodb://localhost:27017/test';
      process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long';
      
      const { getConfig, resetConfig } = await import('../config/index.js');
      resetConfig();
      
      const config = getConfig();
      expect(config.server.env).toBe('staging');
    });
  });
  
  describe('Configuration Values', () => {
    beforeEach(() => {
      // Set required env vars
      process.env.NODE_ENV = 'development';
      process.env.MONGO_URI = 'mongodb://localhost:27017/uzima_test';
      process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters';
      process.env.PORT = '3000';
      process.env.REDIS_URL = 'redis://localhost:6380';
    });
    
    it('should load database configuration', async () => {
      const { getConfig, resetConfig } = await import('../config/index.js');
      resetConfig();
      
      const config = getConfig();
      expect(config.db.uri).toBe('mongodb://localhost:27017/uzima_test');
      expect(config.db.options).toBeDefined();
    });
    
    it('should load server configuration', async () => {
      const { getConfig, resetConfig } = await import('../config/index.js');
      resetConfig();
      
      const config = getConfig();
      expect(config.server.port).toBe(3000);
      expect(config.server.env).toBe('development');
    });
    
    it('should load JWT configuration', async () => {
      const { getConfig, resetConfig } = await import('../config/index.js');
      resetConfig();
      
      const config = getConfig();
      expect(config.jwt.secret).toBe('test-jwt-secret-at-least-32-characters');
    });
    
    it('should load Redis configuration', async () => {
      const { getConfig, resetConfig } = await import('../config/index.js');
      resetConfig();
      
      const config = getConfig();
      expect(config.redis.url).toBe('redis://localhost:6380');
    });
  });
  
  describe('Validation', () => {
    it('should throw error when MONGO_URI is missing', async () => {
      process.env.NODE_ENV = 'development';
      process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters';
      delete process.env.MONGO_URI;
      
      const { initConfig, resetConfig } = await import('../config/index.js');
      resetConfig();
      
      expect(() => initConfig()).toThrow(/MONGO_URI/);
    });
    
    it('should throw error when JWT_SECRET is missing', async () => {
      process.env.NODE_ENV = 'development';
      process.env.MONGO_URI = 'mongodb://localhost:27017/test';
      delete process.env.JWT_SECRET;
      
      const { initConfig, resetConfig } = await import('../config/index.js');
      resetConfig();
      
      expect(() => initConfig()).toThrow(/JWT_SECRET/);
    });
    
    it('should throw error when JWT_SECRET is too short', async () => {
      process.env.NODE_ENV = 'development';
      process.env.MONGO_URI = 'mongodb://localhost:27017/test';
      process.env.JWT_SECRET = 'short';
      
      const { initConfig, resetConfig } = await import('../config/index.js');
      resetConfig();
      
      expect(() => initConfig()).toThrow(/32 characters/);
    });
    
    it('should throw error when MONGO_URI has invalid scheme', async () => {
      process.env.NODE_ENV = 'development';
      process.env.MONGO_URI = 'http://localhost:27017/test';
      process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters';
      
      const { initConfig, resetConfig } = await import('../config/index.js');
      resetConfig();
      
      expect(() => initConfig()).toThrow(/MONGO_URI/);
    });
  });
  
  describe('Environment Helpers', () => {
    it('isDevelopment should return true in development', async () => {
      process.env.NODE_ENV = 'development';
      process.env.MONGO_URI = 'mongodb://localhost:27017/test';
      process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters';
      
      const { isDevelopment, isProduction, isStaging, resetConfig } = 
        await import('../config/index.js');
      resetConfig();
      
      expect(isDevelopment()).toBe(true);
      expect(isProduction()).toBe(false);
      expect(isStaging()).toBe(false);
    });
    
    it('isProduction should return true in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.MONGO_URI = 'mongodb://localhost:27017/test';
      process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters';
      
      const { isDevelopment, isProduction, isStaging, resetConfig } = 
        await import('../config/index.js');
      resetConfig();
      
      expect(isDevelopment()).toBe(false);
      expect(isProduction()).toBe(true);
      expect(isStaging()).toBe(false);
    });
  });
  
  describe('Config Caching', () => {
    it('should return cached config on subsequent calls', async () => {
      process.env.NODE_ENV = 'development';
      process.env.MONGO_URI = 'mongodb://localhost:27017/test';
      process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters';
      
      const { getConfig, resetConfig } = await import('../config/index.js');
      resetConfig();
      
      const config1 = getConfig();
      const config2 = getConfig();
      
      expect(config1).toBe(config2); // Same reference
    });
    
    it('should reset cache when resetConfig is called', async () => {
      process.env.NODE_ENV = 'development';
      process.env.MONGO_URI = 'mongodb://localhost:27017/test';
      process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters';
      
      const { getConfig, resetConfig } = await import('../config/index.js');
      resetConfig();
      
      const config1 = getConfig();
      
      // Change env and reset
      process.env.PORT = '4000';
      resetConfig();
      
      const config2 = getConfig();
      
      expect(config1).not.toBe(config2); // Different reference
      expect(config2.server.port).toBe(4000);
    });
  });
  
  describe('Feature Flags', () => {
    it('should enable detailed errors in development', async () => {
      process.env.NODE_ENV = 'development';
      process.env.MONGO_URI = 'mongodb://localhost:27017/test';
      process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters';
      
      const { getConfig, resetConfig } = await import('../config/index.js');
      resetConfig();
      
      const config = getConfig();
      expect(config.features.enableDetailedErrors).toBe(true);
      expect(config.features.enableStackTrace).toBe(true);
    });
    
    it('should disable detailed errors in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.MONGO_URI = 'mongodb://localhost:27017/test';
      process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters';
      
      const { getConfig, resetConfig } = await import('../config/index.js');
      resetConfig();
      
      const config = getConfig();
      expect(config.features.enableDetailedErrors).toBe(false);
      expect(config.features.enableStackTrace).toBe(false);
    });
  });
});
