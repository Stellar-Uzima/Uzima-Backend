import { isValidCorsOrigin, parseCorsOrigins } from './app.config';

describe('CORS configuration', () => {
  const ORIGINAL_ENV = process.env;

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('parses comma-separated CORS_ORIGINS', () => {
    process.env = {
      CORS_ORIGINS: 'http://localhost:3000, https://app.example.com',
    };
    expect(parseCorsOrigins(process.env)).toEqual([
      'http://localhost:3000',
      'https://app.example.com',
    ]);
  });

  it('falls back to CORS_ORIGIN when CORS_ORIGINS is unset', () => {
    process.env = { CORS_ORIGIN: 'http://localhost:5173' };
    expect(parseCorsOrigins(process.env)).toEqual(['http://localhost:5173']);
  });

  it('rejects invalid origins', () => {
    process.env = { CORS_ORIGINS: 'not-a-valid-origin' };
    expect(() => parseCorsOrigins(process.env)).toThrow(/Invalid CORS origin/i);
  });

  it('rejects wildcard origins', () => {
    expect(isValidCorsOrigin('*')).toBe(false);
    expect(isValidCorsOrigin('http://*')).toBe(false);
  });

  it('deduplicates repeated origins', () => {
    process.env = {
      CORS_ORIGINS: 'http://localhost:3000,http://localhost:3000',
    };
    expect(parseCorsOrigins(process.env)).toEqual(['http://localhost:3000']);
  });
});
