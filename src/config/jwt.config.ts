import { registerAs } from '@nestjs/config';

/**
 * Centralised JWT hardening configuration.
 *
 * Every value is environment driven so deployments can tighten or relax the
 * policy without a code change. Defaults are deliberately strict: tokens must
 * carry both an `iss` and an `aud` claim, and the accepted algorithms list is
 * pinned to HS256 so `alg: none` / asymmetric-confusion attacks are rejected
 * by the strategy itself.
 */
export interface JwtSecurityConfig {
  /** Value expected in the `iss` claim of every issued token. */
  issuer: string;
  /** Value expected in the `aud` claim of every issued token. */
  audience: string;
  /** Accepted signing algorithms. Pinned to prevent algorithm confusion. */
  algorithms: string[];
  /** Access token lifetime, expressed in seconds. */
  accessTokenTtl: number;
  /** Refresh token lifetime, expressed in seconds. */
  refreshTokenTtl: number;
  /** Allowed clock drift (in seconds) when validating `exp` / `nbf`. */
  clockTolerance: number;
  /** Audiences a refresh token may be presented to. */
  refreshAudience: string;
}

/** Default access token lifetime: 15 minutes. */
export const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** Default refresh token lifetime: 7 days. */
export const DEFAULT_REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Reads and validates the numeric env values. Falls back to the provided
 * default when the value is absent, non-numeric or non-positive.
 */
function readPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

/**
 * Allowed clock drift. A small tolerance keeps tokens issued by a slightly
 * lagging node valid for a few seconds without meaningfully widening the
 * window for an attacker.
 */
export const DEFAULT_CLOCK_TOLERANCE_SECONDS = 5;

export const buildJwtSecurityConfig = (
  env: NodeJS.ProcessEnv = process.env,
): JwtSecurityConfig => ({
  issuer: env.JWT_ISSUER?.trim() || 'stellar-uzima',
  audience: env.JWT_AUDIENCE?.trim() || 'stellar-uzima-api',
  algorithms: ['HS256'],
  accessTokenTtl: readPositiveInt(
    env.JWT_ACCESS_TOKEN_TTL,
    DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
  ),
  refreshTokenTtl: readPositiveInt(
    env.JWT_REFRESH_TOKEN_TTL,
    DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
  ),
  clockTolerance: readPositiveInt(
    env.JWT_CLOCK_TOLERANCE,
    DEFAULT_CLOCK_TOLERANCE_SECONDS,
  ),
  refreshAudience:
    env.JWT_REFRESH_AUDIENCE?.trim() || env.JWT_AUDIENCE?.trim() || 'stellar-uzima-api',
});

export default registerAs('jwt', () => buildJwtSecurityConfig());

/**
 * Resolves the effective JWT security config.
 *
 * When `ConfigModule` has already loaded the `jwt` namespace we trust that
 * object; otherwise (unit tests, scripts) we fall back to `process.env`. This
 * lets the strategies depend on a single source of truth without caring how the
 * app was bootstrapped.
 */
export function resolveJwtSecurityConfig(
  namespaced: unknown,
  env: NodeJS.ProcessEnv = process.env,
): JwtSecurityConfig {
  if (namespaced && typeof namespaced === 'object') {
    const candidate = namespaced as Partial<JwtSecurityConfig>;
    if (candidate.issuer && candidate.audience) {
      return {
        issuer: candidate.issuer,
        audience: candidate.audience,
        algorithms: candidate.algorithms?.length
          ? candidate.algorithms
          : ['HS256'],
        accessTokenTtl: candidate.accessTokenTtl ?? DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
        refreshTokenTtl: candidate.refreshTokenTtl ?? DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
        clockTolerance: candidate.clockTolerance ?? DEFAULT_CLOCK_TOLERANCE_SECONDS,
        refreshAudience: candidate.refreshAudience ?? candidate.audience,
      };
    }
  }

  return buildJwtSecurityConfig(env);
}