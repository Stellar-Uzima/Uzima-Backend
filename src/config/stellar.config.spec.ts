import { ConfigService } from '@nestjs/config';
import StellarSdk from 'stellar-sdk';
import {
  NETWORK_PASSPHRASES,
  PUBLIC_HORIZON_URL,
  TESTNET_HORIZON_URL,
  StellarBootException,
  assertStellarSigningMaterial,
  isPlaceholderSecret,
  loadStellarConfig,
  loadStellarSigningConfig,
  maskSecret,
  resolveStellarNetwork,
} from './stellar.config';

function fakeConfigService(env: Record<string, string | undefined>) {
  return {
    get: (key: string) => env[key],
  } as unknown as Pick<ConfigService, 'get'>;
}

describe('stellar.config', () => {
  describe('maskSecret', () => {
    it('masks to SK... plus the last four characters', () => {
      expect(maskSecret('SCREALSECRETVALUEABCD')).toBe('SK...ABCD');
    });

    it('never returns the raw value for empty input', () => {
      expect(maskSecret('')).toBe('SK...<empty>');
      expect(maskSecret(undefined)).toBe('SK...<empty>');
    });
  });

  describe('isPlaceholderSecret', () => {
    it('detects the documented placeholder shapes', () => {
      expect(isPlaceholderSecret('your_stellar_account_secret_key')).toBe(true);
      expect(isPlaceholderSecret('<treasury-secret>')).toBe(true);
      expect(isPlaceholderSecret('${TREASURY_SECRET}')).toBe(true);
      expect(isPlaceholderSecret('change_me_please')).toBe(true);
    });

    it('treats real-looking material and empty values as non-placeholder', () => {
      expect(isPlaceholderSecret('SCZALT7K6ZW6QPK4XQJ5Y4JH3QGZ4QZ4QZ4QZ4QZ4')).toBe(false);
      expect(isPlaceholderSecret('')).toBe(false);
      expect(isPlaceholderSecret(undefined)).toBe(false);
    });
  });

  describe('resolveStellarNetwork', () => {
    it('defaults to testnet and accepts the documented aliases', () => {
      expect(resolveStellarNetwork(undefined)).toBe('testnet');
      expect(resolveStellarNetwork('')).toBe('testnet');
      expect(resolveStellarNetwork('testnet')).toBe('testnet');
      expect(resolveStellarNetwork('public')).toBe('public');
      expect(resolveStellarNetwork('mainnet')).toBe('public');
      expect(resolveStellarNetwork('MAINNET')).toBe('public');
    });

    it('rejects unknown networks instead of guessing', () => {
      expect(() => resolveStellarNetwork('staging')).toThrow(StellarBootException);
      expect(() => resolveStellarNetwork('staging')).toThrow(/STELLAR_NETWORK/);
    });
  });

  describe('loadStellarConfig', () => {
    it('returns safe testnet defaults when nothing is configured', () => {
      const config = loadStellarConfig(fakeConfigService({}));
      expect(config).toEqual({
        network: 'testnet',
        horizonUrl: TESTNET_HORIZON_URL,
        networkPassphrase: NETWORK_PASSPHRASES.testnet,
        treasuryPublicKey: undefined,
        fundingPublicKey: undefined,
      });
    });

    it('derives the passphrase and default endpoint for the public network', () => {
      const config = loadStellarConfig(
        fakeConfigService({ STELLAR_NETWORK: 'public' }),
      );
      expect(config.network).toBe('public');
      expect(config.horizonUrl).toBe(PUBLIC_HORIZON_URL);
      expect(config.networkPassphrase).toBe(NETWORK_PASSPHRASES.public);
    });

    it('fails startup when public network points at a testnet endpoint', () => {
      expect(() =>
        loadStellarConfig(
          fakeConfigService({
            STELLAR_NETWORK: 'public',
            STELLAR_HORIZON_URL: TESTNET_HORIZON_URL,
          }),
        ),
      ).toThrow(/testnet endpoint/);
    });

    it('fails startup when testnet points at the public endpoint', () => {
      expect(() =>
        loadStellarConfig(
          fakeConfigService({
            STELLAR_NETWORK: 'testnet',
            STELLAR_HORIZON_URL: PUBLIC_HORIZON_URL,
          }),
        ),
      ).toThrow(/public endpoint/);
    });

    it('rejects malformed horizon URLs', () => {
      expect(() =>
        loadStellarConfig(
          fakeConfigService({ STELLAR_HORIZON_URL: 'horizon.example' }),
        ),
      ).toThrow(/absolute http\(s\) URL/);
    });

    it('rejects malformed public keys without echoing them', () => {
      const bogus = 'GNOTAPUBLICKEY000000';
      expect(() =>
        loadStellarConfig(
          fakeConfigService({ STELLAR_TREASURY_PUBLIC_KEY: bogus }),
        ),
      ).toThrow(StellarBootException);
      try {
        loadStellarConfig(
          fakeConfigService({ STELLAR_TREASURY_PUBLIC_KEY: bogus }),
        );
      } catch (err) {
        expect((err as Error).message).not.toContain(bogus);
      }
    });

    it('accepts a valid public key', () => {
      const publicKey = StellarSdk.Keypair.random().publicKey();
      const config = loadStellarConfig(
        fakeConfigService({ STELLAR_TREASURY_PUBLIC_KEY: publicKey }),
      );
      expect(config.treasuryPublicKey).toBe(publicKey);
    });
  });

  describe('loadStellarSigningConfig', () => {
    it('reads signing material through the config service only', () => {
      const signing = loadStellarSigningConfig(
        fakeConfigService({
          STELLAR_SIGNING_ENABLED: 'true',
          STELLAR_TREASURY_SECRET_KEY: 'SCTREASURY1234',
          STELLAR_FUNDING_SECRET_KEY: 'SCFUNDING5678',
        }),
      );
      expect(signing).toEqual({
        signingEnabled: true,
        treasurySecretKey: 'SCTREASURY1234',
        fundingSecretKey: 'SCFUNDING5678',
      });
    });

    it('falls back to the legacy funding secret name', () => {
      const signing = loadStellarSigningConfig(
        fakeConfigService({ STELLAR_FUNDING_SECRET: 'your_stellar_account_secret_key' }),
      );
      expect(signing.fundingSecretKey).toBe('your_stellar_account_secret_key');
      expect(signing.signingEnabled).toBe(false);
    });
  });

  describe('assertStellarSigningMaterial', () => {
    it('stays non-blocking on testnet when secrets are absent', () => {
      expect(() =>
        assertStellarSigningMaterial(fakeConfigService({}), 'testnet'),
      ).not.toThrow();
    });

    it('stays non-blocking on testnet when placeholders are present', () => {
      expect(() =>
        assertStellarSigningMaterial(
          fakeConfigService({
            STELLAR_TREASURY_SECRET_KEY: 'your_stellar_account_secret_key',
          }),
          'testnet',
        ),
      ).not.toThrow();
    });

    it('blocks bootstrap on public with placeholder secrets, masked in the message', () => {
      const raw = 'your_stellar_account_secret_key';
      let caught: unknown;
      try {
        assertStellarSigningMaterial(
          fakeConfigService({ STELLAR_TREASURY_SECRET_KEY: raw }),
          'public',
        );
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(StellarBootException);
      const message = (caught as Error).message;
      expect(message).toContain('placeholder');
      expect(message).not.toContain(raw);
      expect(message).toContain(maskSecret(raw));
    });

    it('blocks bootstrap on public when signing is enabled without a treasury key', () => {
      expect(() =>
        assertStellarSigningMaterial(
          fakeConfigService({ STELLAR_SIGNING_ENABLED: 'true' }),
          'public',
        ),
      ).toThrow(/STELLAR_TREASURY_SECRET_KEY is not set/);
    });

    it('allows public with signing disabled and no secrets', () => {
      expect(() =>
        assertStellarSigningMaterial(fakeConfigService({}), 'public'),
      ).not.toThrow();
    });
  });
});
