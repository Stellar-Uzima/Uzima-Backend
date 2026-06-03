import { registerAs } from '@nestjs/config';

const ORIGIN_PATTERN = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

export function isValidCorsOrigin(origin: string): boolean {
  if (!origin || origin.includes('*')) {
    return false;
  }
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:') && ORIGIN_PATTERN.test(origin);
  } catch {
    return false;
  }
}

export function parseCorsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.CORS_ORIGINS ?? env.CORS_ORIGIN ?? 'http://localhost:3000';
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    throw new Error('At least one CORS origin must be configured');
  }

  const invalid = origins.filter((origin) => !isValidCorsOrigin(origin));
  if (invalid.length > 0) {
    throw new Error(`Invalid CORS origin(s): ${invalid.join(', ')}`);
  }

  return [...new Set(origins)];
}

export default registerAs('app', () => {
  const corsOrigins = parseCorsOrigins(process.env);

  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT ?? '3000', 10) || 3000,
    apiPrefix: process.env.API_PREFIX || 'api',
    name: 'Stellar Uzima Backend',
    version: '1.0.0',
    corsOrigin: corsOrigins[0],
    corsOrigins,
    jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
    jwtExpiration: process.env.JWT_EXPIRATION || '7d',
    isDevelopment: process.env.NODE_ENV !== 'production',
    isProduction: process.env.NODE_ENV === 'production',
  };
});
