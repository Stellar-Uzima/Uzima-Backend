/**
 * Fails fast at boot when required environment variables are missing,
 * so misconfiguration surfaces immediately instead of at first use.
 */

const REQUIRED_ENV_VARS = ['NODE_ENV', 'PORT', 'JWT_SECRET', 'MONGODB_URI'] as const;

const ENVIRONMENTS = ['development', 'staging', 'production', 'test'] as const;

export function assertStartupConfig(env: NodeJS.ProcessEnv = process.env): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !env[key] || env[key]?.trim() === '');

  if (missing.length > 0) {
    throw new Error(
      `Startup config check failed: missing required environment variable(s): ${missing.join(', ')}`,
    );
  }

  const nodeEnv = env.NODE_ENV as string;
  if (!ENVIRONMENTS.includes(nodeEnv as (typeof ENVIRONMENTS)[number])) {
    throw new Error(
      `Startup config check failed: NODE_ENV="${nodeEnv}" is not one of ${ENVIRONMENTS.join(', ')}`,
    );
  }
}
