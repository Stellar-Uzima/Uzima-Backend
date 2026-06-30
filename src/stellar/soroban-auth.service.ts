import { Injectable, Logger } from '@nestjs/common';
import StellarSdk from 'stellar-sdk';

/** The two supported Soroban authorization types. */
export type SorobanAuthType = 'Ed25519' | 'SmartWallet';

export interface SorobanAuthResult {
  /** Detected authorization type. */
  authorizationType: SorobanAuthType;
  /** Ed25519 public key (G… address) — present when authorizationType is 'Ed25519'. */
  publicKey?: string;
  /** Smart Wallet contract ID (C… address) — present when authorizationType is 'SmartWallet'. */
  contractId?: string;
  /** Signature expiration ledger from the credentials, if available. */
  signatureExpirationLedger?: number;
}

@Injectable()
export class SorobanAuthService {
  private readonly logger = new Logger(SorobanAuthService.name);
  private readonly xdr = (StellarSdk as any).xdr;
  private readonly StrKey = (StellarSdk as any).StrKey;

  /**
   * Detects whether a base64-encoded SorobanAuthorizationEntry uses an
   * Ed25519 (source-account) or Smart Wallet (contract address) credential,
   * and returns the decoded details.
   *
   * @param authEntryXdrBase64  Base64-encoded XDR of a SorobanAuthorizationEntry
   * @throws Error for unknown or malformed payloads
   */
  decodeAuthorizationEntry(authEntryXdrBase64: string): SorobanAuthResult {
    if (!authEntryXdrBase64 || typeof authEntryXdrBase64 !== 'string') {
      throw new Error('Invalid authorization payload: must be a non-empty string');
    }

    let entry: any;
    try {
      entry = this.xdr.SorobanAuthorizationEntry.fromXDR(
        authEntryXdrBase64,
        'base64',
      );
    } catch {
      throw new Error('Malformed authorization payload: failed to decode XDR');
    }

    const credentials: any = entry.credentials();
    const credentialsType = credentials.switch();

    if (credentialsType.name === 'sorobanCredentialsSourceAccount') {
      // Ed25519: the source account signs with its ed25519 key
      this.logger.debug('Detected Ed25519 authorization');
      return { authorizationType: 'Ed25519' };
    }

    if (credentialsType.name === 'sorobanCredentialsAddress') {
      const addressCredentials: any = credentials.address();
      const scAddress: any = addressCredentials.address();
      const addressType = scAddress.switch();
      const expirationLedger: number = addressCredentials.signatureExpirationLedger();

      if (addressType.name === 'scAddressTypeAccount') {
        // Ed25519 public key wrapped in an address credential
        const accountId: any = scAddress.accountId();
        const publicKey: string = this.StrKey.encodeEd25519PublicKey(
          accountId.ed25519(),
        );
        this.logger.debug('Detected Ed25519 address authorization');
        return {
          authorizationType: 'Ed25519',
          publicKey,
          signatureExpirationLedger: expirationLedger,
        };
      }

      if (addressType.name === 'scAddressTypeContract') {
        // Smart Wallet: a contract acts as the signer
        const contractId: string = this.StrKey.encodeContract(
          scAddress.contractId(),
        );
        this.logger.debug('Detected Smart Wallet authorization, contractId=%s', contractId);
        return {
          authorizationType: 'SmartWallet',
          contractId,
          signatureExpirationLedger: expirationLedger,
        };
      }
    }

    throw new Error(
      `Unknown authorization credential type: ${credentialsType.name}`,
    );
  }
}
