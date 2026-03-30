import { validateEnv, envValidationSchema } from './env.validation';

describe('envValidationSchema', () => {
  const ORIGINAL_ENV = process.env;

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  const validEnv = {
    DATABASE_HOST: 'localhost',
    DATABASE_PORT: '5432',
    DATABASE_USERNAME: 'postgres',
    DATABASE_PASSWORD: 'secretpassword',
    DATABASE_NAME: 'uzima_db',
    REDIS_URL: 'redis://127.0.0.1:6379',
    JWT_SECRET: 'this-is-a-secret-key-that-is-at-least-32-chars-long',
    STELLAR_NETWORK: 'testnet',
    STELLAR_TREASURY_SECRET_KEY: 'SBX1234567890abcdefghijklmnopqrstuvwxyz1234567890',
  };

  describe('validateEnv', () => {
    it('passes with all required env vars present and valid', () => {
      process.env = { ...validEnv };
      expect(() => validateEnv()).not.toThrow();
    });

    it('throws when JWT_SECRET is missing', () => {
      const env = { ...validEnv };
      delete env.JWT_SECRET;
      process.env = env;
      expect(() => validateEnv()).toThrow(/JWT_SECRET/i);
    });

    it('throws when JWT_SECRET is shorter than 32 characters', () => {
      process.env = { ...validEnv, JWT_SECRET: 'short' };
      expect(() => validateEnv()).toThrow(/JWT_SECRET/i);
    });

    it('throws when REDIS_URL is missing', () => {
      const env = { ...validEnv };
      delete env.REDIS_URL;
      process.env = env;
      expect(() => validateEnv()).toThrow(/REDIS_URL/i);
    });

    it('throws when REDIS_URL is not a valid redis URI', () => {
      process.env = { ...validEnv, REDIS_URL: 'not-a-valid-url' };
      expect(() => validateEnv()).toThrow(/REDIS_URL/i);
    });

    it('throws when STELLAR_TREASURY_SECRET_KEY is missing', () => {
      const env = { ...validEnv };
      delete env.STELLAR_TREASURY_SECRET_KEY;
      process.env = env;
      expect(() => validateEnv()).toThrow(/STELLAR_TREASURY_SECRET_KEY/i);
    });

    it('throws when STELLAR_NETWORK is missing', () => {
      const env = { ...validEnv };
      delete env.STELLAR_NETWORK;
      process.env = env;
      expect(() => validateEnv()).toThrow(/STELLAR_NETWORK/i);
    });

    it('throws when STELLAR_NETWORK is not testnet or mainnet', () => {
      process.env = { ...validEnv, STELLAR_NETWORK: 'invalid' };
      expect(() => validateEnv()).toThrow(/STELLAR_NETWORK/i);
    });

    it('throws when DATABASE_HOST is missing', () => {
      const env = { ...validEnv };
      delete env.DATABASE_HOST;
      process.env = env;
      expect(() => validateEnv()).toThrow(/DATABASE_HOST/i);
    });

    it('throws when DATABASE_NAME is missing', () => {
      const env = { ...validEnv };
      delete env.DATABASE_NAME;
      process.env = env;
      expect(() => validateEnv()).toThrow(/DATABASE_NAME/i);
    });

    it('throws when DATABASE_USERNAME is missing', () => {
      const env = { ...validEnv };
      delete env.DATABASE_USERNAME;
      process.env = env;
      expect(() => validateEnv()).toThrow(/DATABASE_USERNAME/i);
    });

    it('throws when DATABASE_PASSWORD is missing', () => {
      const env = { ...validEnv };
      delete env.DATABASE_PASSWORD;
      process.env = env;
      expect(() => validateEnv()).toThrow(/DATABASE_PASSWORD/i);
    });

    it('accepts valid DATABASE_PORT within range', () => {
      process.env = { ...validEnv, DATABASE_PORT: '8080' };
      expect(() => validateEnv()).not.toThrow();
    });

    it('throws when DATABASE_PORT is out of range (> 65535)', () => {
      process.env = { ...validEnv, DATABASE_PORT: '70000' };
      expect(() => validateEnv()).toThrow();
    });

    it('throws when DATABASE_PORT is out of range (< 1)', () => {
      process.env = { ...validEnv, DATABASE_PORT: '0' };
      expect(() => validateEnv()).toThrow();
    });

    it('defaults DATABASE_PORT to 5432 when not provided', () => {
      const env = { ...validEnv };
      delete env.DATABASE_PORT;
      process.env = env;
      const result = validateEnv();
      expect(result.DATABASE_PORT).toBe(5432);
    });

    it('throws clear error naming exact missing variable', () => {
      const env = { ...validEnv };
      delete env.JWT_SECRET;
      process.env = env;
      try {
        validateEnv();
        fail('Expected validateEnv to throw');
      } catch (e: any) {
        expect(e.message).toMatch(/JWT_SECRET/);
      }
    });
  });
});
