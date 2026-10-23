import { ConfigService } from '@nestjs/config';
import StellarSdk from 'stellar-sdk';

/** Supported Stellar networks. `mainnet` is accepted as an explicit alias of `public`. */
export type StellarNetwork = 'testnet' | 'public';

/**
 * Validated Stellar network settings (#1532). The shape deliberately excludes
 * signing material: secrets never travel in this object so they cannot leak
 * through logs, diagnostics, or API responses.
 */
export interface StellarNetworkConfig {
  network: StellarNetwork;
  horizonUrl: string;
  networkPassphrase: string;
  treasuryPublicKey?: string;
  fundingPublicKey?: string;
}

/** Signing material (#1533). Never log these values; use `maskSecret` for diagnostics. */
export interface StellarSigningConfig {
  signingEnabled: boolean;
  treasurySecretKey?: string;
  fundingSecretKey?: string;
}

export const TESTNET_HORIZON_URL = 'https://horizon-testnet.stellar.org';
export const PUBLIC_HORIZON_URL = 'https://horizon.stellar.org';

export const NETWORK_PASSPHRASES: Record<StellarNetwork, string> = {
  testnet: 'Test SDF Network ; September 2015',
  public: 'Public Global Stellar Network ; September 2015',
};

/** Raised when Stellar network or signing configuration is unsafe to boot with. */
export class StellarBootException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StellarBootException';
  }
}

/**
 * Masks signing material for any log or error message: `SK...` plus the last
 * four characters, so operators can correlate values without exposing them.
 */
export function maskSecret(value?: string | null): string {
  if (!value || value.length === 0) return 'SK...<empty>';
  return `SK...${value.slice(-4)}`;
}

/** True when a value is an obvious placeholder rather than real signing material. */
export function isPlaceholderSecret(value?: string | null): boolean {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized.length === 0) return false;
  return (
    normalized.startsWith('your_') ||
    normalized.includes('placeholder') ||
    normalized.includes('example') ||
    normalized.includes('change_me') ||
    normalized.startsWith('<') ||
    normalized.startsWith('${')
  );
}

/**
 * Resolves and validates `STELLAR_NETWORK`. Unknown values fail startup with an
 * actionable error instead of silently defaulting to the wrong network (#1532).
 */
export function resolveStellarNetwork(raw?: string | null): StellarNetwork {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === '') return 'testnet';
  if (value === 'testnet') return 'testnet';
  if (value === 'public' || value === 'mainnet') return 'public';
  throw new StellarBootException(
    `STELLAR_NETWORK="${raw}" is invalid. Expected "testnet" or "public" ` +
      `("mainnet" is accepted as an alias of "public").`,
  );
}

function classifyHorizonUrl(url: string): 'testnet' | 'public' | 'unknown' {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('testnet')) return 'testnet';
    if (host === 'horizon.stellar.org') return 'public';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

function normalizeOptional(value?: string | null): string | undefined {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function assertValidPublicKey(name: string, value?: string): void {
  if (!value) return;
  if (!StellarSdk.StrKey.isValidEd25519PublicKey(value)) {
    // The value itself is never echoed back: a mislabeled secret must not leak here.
    throw new StellarBootException(
      `${name} is not a valid Stellar public key (expected a G... address). ` +
        `Correct the value in your environment.`,
    );
  }
}

/**
 * Loads and validates the Stellar network configuration from ConfigService
 * (#1532). Safe defaults match the current testnet behavior; public/test
 * endpoint mismatches and malformed keys fail startup with actionable errors.
 */
export function loadStellarConfig(
  configService: Pick<ConfigService, 'get'>,
): StellarNetworkConfig {
  const network = resolveStellarNetwork(configService.get<string>('STELLAR_NETWORK'));

  const rawUrl = normalizeOptional(configService.get<string>('STELLAR_HORIZON_URL'));
  const horizonUrl =
    rawUrl ?? (network === 'public' ? PUBLIC_HORIZON_URL : TESTNET_HORIZON_URL);

  if (!/^https?:\/\/\S+$/i.test(horizonUrl)) {
    throw new StellarBootException(
      `STELLAR_HORIZON_URL must be an absolute http(s) URL; got "${horizonUrl}".`,
    );
  }

  const urlNetwork = classifyHorizonUrl(horizonUrl);
  if (network === 'public' && urlNetwork === 'testnet') {
    throw new StellarBootException(
      `STELLAR_NETWORK=public but STELLAR_HORIZON_URL points at the testnet endpoint ` +
        `(${horizonUrl}). Set STELLAR_HORIZON_URL=${PUBLIC_HORIZON_URL} for the public ` +
        `network, or set STELLAR_NETWORK=testnet.`,
    );
  }
  if (network === 'testnet' && urlNetwork === 'public') {
    throw new StellarBootException(
      `STELLAR_NETWORK=testnet but STELLAR_HORIZON_URL points at the public endpoint ` +
        `(${horizonUrl}). Set STELLAR_HORIZON_URL=${TESTNET_HORIZON_URL} for testnet, ` +
        `or set STELLAR_NETWORK=public.`,
    );
  }

  const treasuryPublicKey = normalizeOptional(
    configService.get<string>('STELLAR_TREASURY_PUBLIC_KEY'),
  );
  const fundingPublicKey = normalizeOptional(
    configService.get<string>('STELLAR_FUNDING_PUBLIC_KEY'),
  );
  assertValidPublicKey('STELLAR_TREASURY_PUBLIC_KEY', treasuryPublicKey);
  assertValidPublicKey('STELLAR_FUNDING_PUBLIC_KEY', fundingPublicKey);

  return {
    network,
    horizonUrl,
    networkPassphrase: NETWORK_PASSPHRASES[network],
    treasuryPublicKey,
    fundingPublicKey,
  };
}

/**
 * Loads signing material through ConfigService only (#1533). Callers must
 * never log or return the returned secret values; use `maskSecret` instead.
 */
export function loadStellarSigningConfig(
  configService: Pick<ConfigService, 'get'>,
): StellarSigningConfig {
  const signingEnabled =
    (normalizeOptional(configService.get<string>('STELLAR_SIGNING_ENABLED')) ?? '')
      .toLowerCase() === 'true';
  const treasurySecretKey = normalizeOptional(
    configService.get<string>('STELLAR_TREASURY_SECRET_KEY'),
  );
  const fundingSecretKey =
    normalizeOptional(configService.get<string>('STELLAR_FUNDING_SECRET_KEY')) ??
    // Legacy environment name retained for existing deployments.
    normalizeOptional(configService.get<string>('STELLAR_FUNDING_SECRET'));

  return { signingEnabled, treasurySecretKey, fundingSecretKey };
}

/**
 * Startup guard for signing material (#1533). On the public network,
 * placeholder testnet-shaped secrets (or missing secrets while signing is
 * enabled) abort bootstrap with an actionable error. Testnet/dev setups stay
 * non-blocking when secrets are absent.
 */
export function assertStellarSigningMaterial(
  configService: Pick<ConfigService, 'get'>,
  network: StellarNetwork,
): void {
  const { signingEnabled, treasurySecretKey, fundingSecretKey } =
    loadStellarSigningConfig(configService);

  if (network === 'public') {
    const provided: Array<[string, string | undefined]> = [
      ['STELLAR_TREASURY_SECRET_KEY', treasurySecretKey],
      ['STELLAR_FUNDING_SECRET_KEY', fundingSecretKey],
    ];
    for (const [name, value] of provided) {
      if (value && isPlaceholderSecret(value)) {
        throw new StellarBootException(
          `STELLAR_NETWORK=public but ${name} is a placeholder testnet-shaped value ` +
            `(${maskSecret(value)}). Replace it with real signing material, or switch to ` +
            `STELLAR_NETWORK=testnet for development.`,
        );
      }
    }
    if (signingEnabled && !treasurySecretKey) {
      throw new StellarBootException(
        `STELLAR_SIGNING_ENABLED=true but STELLAR_TREASURY_SECRET_KEY is not set. ` +
          `Provide the treasury signing key, or set STELLAR_SIGNING_ENABLED=false.`,
      );
    }
  }
}
