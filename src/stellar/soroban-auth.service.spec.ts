import { Test, TestingModule } from '@nestjs/testing';
import { SorobanAuthService } from './soroban-auth.service';

// Real XDR fixtures generated with stellar-sdk xdr builders.
// See scripts/generate-test-fixtures.ts for reproduction steps.

/**
 * SorobanAuthorizationEntry with sorobanCredentialsSourceAccount:
 * classic Ed25519 — no address credentials, just the source account.
 */
const SRC_ACCOUNT_XDR =
  'AAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEdGVzdAAAAAAAAAAA';

/**
 * SorobanAuthorizationEntry with sorobanCredentialsAddress (scAddressTypeAccount):
 * Ed25519 key wrapped in an address credential.
 * Public key: GCFYRR57USYMII3FM4LIBNGIWPRA55LF7SOT52IQ5XCZMHBZQTDD7FHW
 * signatureExpirationLedger: 1000
 */
const ADDR_ACCOUNT_XDR =
  'AAAAAQAAAAAAAAAAi4jHv6SwxCNlZxaAtMiz4g71ZfydPukQ7cWWHDmExj8AAAAAAAAwOQAAA+gAAAABAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAR0ZXN0AAAAAAAAAAA=';
const ADDR_ACCOUNT_PUBKEY = 'GCFYRR57USYMII3FM4LIBNGIWPRA55LF7SOT52IQ5XCZMHBZQTDD7FHW';

/**
 * SorobanAuthorizationEntry with sorobanCredentialsAddress (scAddressTypeContract):
 * Smart Wallet — a contract acts as the signer.
 * Contract ID: CDPN5XW633PN5XW633PN5XW633PN5XW633PN5XW633PN5XW633PN4I4N
 * signatureExpirationLedger: 2000
 */
const SMART_WALLET_XDR =
  'AAAAAQAAAAHe3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3t7e3gAAAAAAAYafAAAH0AAAAAEAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABGNhbGwAAAAAAAAAAA==';
const SMART_WALLET_CONTRACT_ID =
  'CDPN5XW633PN5XW633PN5XW633PN5XW633PN5XW633PN5XW633PN4I4N';

describe('SorobanAuthService', () => {
  let service: SorobanAuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SorobanAuthService],
    }).compile();

    service = module.get<SorobanAuthService>(SorobanAuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── Ed25519 source-account credential ────────────────────────────────────

  describe('sorobanCredentialsSourceAccount (classic Ed25519)', () => {
    it('detects authorization type as Ed25519', () => {
      const result = service.decodeAuthorizationEntry(SRC_ACCOUNT_XDR);
      expect(result.authorizationType).toBe('Ed25519');
    });

    it('does not include a publicKey for source-account credentials', () => {
      const result = service.decodeAuthorizationEntry(SRC_ACCOUNT_XDR);
      expect(result.publicKey).toBeUndefined();
    });

    it('does not include a contractId', () => {
      const result = service.decodeAuthorizationEntry(SRC_ACCOUNT_XDR);
      expect(result.contractId).toBeUndefined();
    });
  });

  // ─── Ed25519 address credential ───────────────────────────────────────────

  describe('sorobanCredentialsAddress with scAddressTypeAccount (Ed25519)', () => {
    it('detects authorization type as Ed25519', () => {
      const result = service.decodeAuthorizationEntry(ADDR_ACCOUNT_XDR);
      expect(result.authorizationType).toBe('Ed25519');
    });

    it('returns the correct Ed25519 public key', () => {
      const result = service.decodeAuthorizationEntry(ADDR_ACCOUNT_XDR);
      expect(result.publicKey).toBe(ADDR_ACCOUNT_PUBKEY);
    });

    it('does not include a contractId', () => {
      const result = service.decodeAuthorizationEntry(ADDR_ACCOUNT_XDR);
      expect(result.contractId).toBeUndefined();
    });

    it('returns the signatureExpirationLedger', () => {
      const result = service.decodeAuthorizationEntry(ADDR_ACCOUNT_XDR);
      expect(result.signatureExpirationLedger).toBe(1000);
    });
  });

  // ─── Smart Wallet credential ──────────────────────────────────────────────

  describe('sorobanCredentialsAddress with scAddressTypeContract (Smart Wallet)', () => {
    it('detects authorization type as SmartWallet', () => {
      const result = service.decodeAuthorizationEntry(SMART_WALLET_XDR);
      expect(result.authorizationType).toBe('SmartWallet');
    });

    it('returns the correct contract ID', () => {
      const result = service.decodeAuthorizationEntry(SMART_WALLET_XDR);
      expect(result.contractId).toBe(SMART_WALLET_CONTRACT_ID);
    });

    it('does not include a publicKey', () => {
      const result = service.decodeAuthorizationEntry(SMART_WALLET_XDR);
      expect(result.publicKey).toBeUndefined();
    });

    it('returns the signatureExpirationLedger', () => {
      const result = service.decodeAuthorizationEntry(SMART_WALLET_XDR);
      expect(result.signatureExpirationLedger).toBe(2000);
    });
  });

  // ─── Authorization type detection correctness ─────────────────────────────

  describe('authorization type detection', () => {
    it('correctly distinguishes Ed25519 source-account from SmartWallet', () => {
      const ed25519 = service.decodeAuthorizationEntry(SRC_ACCOUNT_XDR);
      const smartWallet = service.decodeAuthorizationEntry(SMART_WALLET_XDR);
      expect(ed25519.authorizationType).not.toBe(smartWallet.authorizationType);
    });

    it('Ed25519 address credential produces the same type as source-account', () => {
      const srcAccount = service.decodeAuthorizationEntry(SRC_ACCOUNT_XDR);
      const addrAccount = service.decodeAuthorizationEntry(ADDR_ACCOUNT_XDR);
      expect(srcAccount.authorizationType).toBe(addrAccount.authorizationType);
    });
  });

  // ─── Error handling ───────────────────────────────────────────────────────

  describe('invalid / malformed payloads', () => {
    it('throws on empty string', () => {
      expect(() => service.decodeAuthorizationEntry('')).toThrow(
        'Invalid authorization payload',
      );
    });

    it('throws on null-like input', () => {
      expect(() => service.decodeAuthorizationEntry(null as any)).toThrow(
        'Invalid authorization payload',
      );
    });

    it('throws on random non-XDR base64', () => {
      expect(() =>
        service.decodeAuthorizationEntry(
          Buffer.from('not-xdr-data-at-all').toString('base64'),
        ),
      ).toThrow('Malformed authorization payload');
    });

    it('throws on plain text', () => {
      expect(() =>
        service.decodeAuthorizationEntry('hello world'),
      ).toThrow('Malformed authorization payload');
    });
  });
});
