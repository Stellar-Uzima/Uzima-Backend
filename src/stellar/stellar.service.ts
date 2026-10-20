// src/stellar/stellar.service.ts
import { Injectable, Logger } from '@nestjs/common';
import StellarSdk from 'stellar-sdk';
import {
  ResilienceService,
  RetryPolicyOptions,
} from '../shared/resilience/resilience.service';
import { CreateStellarDto } from './dto/create-stellar.dto';
import { UpdateStellarDto } from './dto/update-stellar.dto';

@Injectable()
export class StellarService {
  private readonly logger = new Logger(StellarService.name);

  /**
   * Resilient policy for Horizon calls: bounded timeouts, exponential backoff
   * with jitter and a circuit breaker keyed on `horizon.*`. When the provider
   * is unresponsive the downstream calls fail fast with a typed
   * `ThirdPartyApiError`, and the service methods degrade gracefully instead
   * of throwing raw network errors to callers.
   */
  private readonly horizonPolicy: RetryPolicyOptions = {
    attempts: 3,
    baseDelayMs: 250,
    maxDelayMs: 4000,
    timeoutMs: 8000,
    circuit: { failureThreshold: 5, openDurationMs: 30_000 },
  };

  private server: InstanceType<typeof StellarSdk.Horizon.Server>;

  constructor(private readonly resilienceService: ResilienceService) {
    this.server = new StellarSdk.Horizon.Server(
      'https://horizon-testnet.stellar.org',
    );
  }

  async accountExists(address: string): Promise<boolean> {
    try {
      await this.resilienceService.execute(
        'horizon.account',
        () => this.server.accounts().accountId(address).call(),
        this.horizonPolicy,
      );
      return true;
    } catch (err: unknown) {
      // Safe fallback: a provider outage must never crash the caller.
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`accountExists failsafe for ${address}: ${message}`);
      return false;
    }
  }

  async getAccountBalance(address: string): Promise<string | null> {
    try {
      const account = await this.resilienceService.execute(
        'horizon.balance',
        () => this.server.accounts().accountId(address).call(),
        this.horizonPolicy,
      );
      const xlmBalance = account.balances.find(
        (balance) => balance.asset_type === 'native',
      );
      return xlmBalance ? xlmBalance.balance : '0';
    } catch (err: unknown) {
      // Safe fallback: return null instead of throwing to callers.
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`getAccountBalance failsafe for ${address}: ${message}`);
      return null;
    }
  }

  async create(_createStellarDto: CreateStellarDto): Promise<unknown> {
    return {};
  }

  async findAll(): Promise<unknown[]> {
    return [];
  }

  async findOne(_id: number): Promise<unknown> {
    return null;
  }

  async update(
    _id: number,
    _updateStellarDto: UpdateStellarDto,
  ): Promise<unknown> {
    return {};
  }

  async remove(_id: number): Promise<void> {}

  /**
   * Horizon base URL backing this service.
   */
  getHorizonUrl(): string {
    return String(this.server.serverURL);
  }

  /**
   * Stellar network label implied by the configured Horizon server.
   */
  getNetworkName(): 'testnet' | 'public' {
    const url = this.getHorizonUrl();
    if (url.includes('testnet')) {
      return 'testnet';
    }
    return url.includes('horizon.stellar.org') ? 'public' : 'testnet';
  }

  /**
   * Network passphrase implied by the configured Horizon server. Envelopes
   * built for a different network fail signature verification closed.
   */
  getNetworkPassphrase(): string {
    return this.getNetworkName() === 'public'
      ? StellarSdk.Networks.PUBLIC
      : StellarSdk.Networks.TESTNET;
  }

  /**
   * Verifies an ed25519 signature over a transaction's signature base.
   * Returns false for any malformed input; never throws for invalid input.
   */
  verifyTransactionSignature(xdr: string, signatureBase64: string, publicKey: string): boolean {
    try {
      const transaction = StellarSdk.TransactionBuilder.fromXDR(xdr, this.getNetworkPassphrase());
      const message = transaction.hash();
      return crypto.verify(
        null,
        message,
        this.toPublicKeyObject(publicKey),
        Buffer.from(signatureBase64, 'base64')
      );
    } catch {
      return false;
    }
  }

  /**
   * Verifies an ed25519 signature over the sha256 digest of a UTF-8 message.
   * Used for off-chain ownership proofs (e.g. account linking). Returns false
   * for any malformed input; never throws for invalid input.
   */
  verifyMessageSignature(message: string, signatureBase64: string, publicKey: string): boolean {
    try {
      const digest = crypto.createHash('sha256').update(message, 'utf8').digest();
      return crypto.verify(
        null,
        digest,
        this.toPublicKeyObject(publicKey),
        Buffer.from(signatureBase64, 'base64')
      );
    } catch {
      return false;
    }
  }

  /**
   * Fetches a transaction's details from Horizon, including the destination
   * account of its first payment-like operation. Returns null when the
   * transaction does not exist on the configured network.
   */
  async getTransactionDetails(hash: string): Promise<StellarTransactionDetails | null> {
    try {
      const transaction = await this.resilienceService.execute(
        'horizon.transaction',
        () => this.server.transactions().transaction(hash).call(),
        this.horizonPolicy
      );

      let to: string | null = null;
      try {
        const operations = await this.resilienceService.execute(
          'horizon.transaction.operations',
          () => this.server.operations().forTransaction(hash).call(),
          this.horizonPolicy
        );
        const ops = operations.records as unknown as Array<{ to?: string; destination?: string }>;
        const payment = ops.find((op) => op.to || op.destination);
        to = payment?.to ?? payment?.destination ?? null;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`getTransactionDetails operations lookup failed for ${hash}: ${message}`);
      }

      return {
        hash: transaction.hash,
        ledger: transaction.ledger,
        successful: transaction.successful,
        createdAt: transaction.created_at,
        sourceAccount: transaction.source_account,
        fee: transaction.fee_charged,
        envelopeXdr: transaction.envelope_xdr,
        resultXdr: transaction.result_xdr,
        resultMetaXdr: transaction.result_meta_xdr,
        to,
      };
    } catch (err: unknown) {
      if (this.isHorizonNotFound(err)) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Wraps a decoded ed25519 public key as a crypto KeyObject. Node's
   * signature verifier only accepts PEM/DER/JWK key material, not raw bytes.
   */
  private toPublicKeyObject(publicKey: string): crypto.KeyObject {
    const rawKey = StellarSdk.StrKey.decodeEd25519PublicKey(publicKey);
    return crypto.createPublicKey({
      key: { kty: 'OKP', crv: 'Ed25519', x: rawKey.toString('base64url') },
      format: 'jwk',
    });
  }

  /**
   * Detects Horizon 404 responses, including when wrapped by ResilienceService.
   */
  private isHorizonNotFound(err: unknown): boolean {
    if (!err) {
      return false;
    }
    const candidate = err as { response?: { status?: number }; name?: string; message?: string };
    if (candidate.response?.status === 404) {
      return true;
    }
    if (candidate.name === 'NotFoundError' || candidate.name === 'ApiNotFoundError') {
      return true;
    }
    return /status code 404|not found/i.test(candidate.message ?? '');
  }
}

import * as crypto from 'crypto';

/**
 * Normalized Horizon transaction details returned by `getTransactionDetails`.
 */
export interface StellarTransactionDetails {
  hash: string;
  ledger: number;
  successful: boolean;
  createdAt: string;
  sourceAccount: string;
  fee: string;
  envelopeXdr: string;
  resultXdr: string;
  resultMetaXdr: string;
  to: string | null;
}
