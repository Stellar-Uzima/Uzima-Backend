import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import StellarSdk from 'stellar-sdk';
import {
  ResilienceService,
  RetryPolicyOptions,
  ThirdPartyApiError,
} from '../shared/resilience/resilience.service';
import { loadStellarConfig } from '../config/stellar.config';

/**
 * Bounded retry/backoff/circuit policy for outbound Horizon calls (#1531):
 * three attempts with exponential backoff, a per-call timeout, and a circuit
 * breaker so a Horizon outage fails fast instead of hanging callers.
 */
export const HORIZON_RESILIENCE_POLICY: RetryPolicyOptions = {
  attempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 8000,
  timeoutMs: 10000,
  circuit: { failureThreshold: 5, openDurationMs: 30_000 },
};

/**
 * Resilient facade over Stellar Horizon (#1531). Every outbound operation runs
 * through `ResilienceService`; circuit-open and retry-exhausted failures are
 * surfaced as actionable `ThirdPartyApiError` values so callers must handle an
 * outage explicitly instead of silently treating it as success.
 */
@Injectable()
export class StellarResilienceService {
  private readonly server: InstanceType<typeof StellarSdk.Horizon.Server>;
  private readonly networkPassphrase: string;

  constructor(
    private readonly resilienceService: ResilienceService,
    configService: ConfigService,
  ) {
    const networkConfig = loadStellarConfig(configService);
    this.server = new StellarSdk.Horizon.Server(networkConfig.horizonUrl);
    this.networkPassphrase = networkConfig.networkPassphrase;
  }

  /**
   * Runs one Horizon operation under the shared retry policy.
   *
   * @throws ThirdPartyApiError when the circuit is open or retries are exhausted.
   */
  async execute<T>(
    key: string,
    operation: () => Promise<T>,
    options: RetryPolicyOptions = {},
  ): Promise<T> {
    const policy: RetryPolicyOptions = {
      ...HORIZON_RESILIENCE_POLICY,
      ...options,
      circuit: { ...HORIZON_RESILIENCE_POLICY.circuit, ...options.circuit },
    };
    try {
      return await this.resilienceService.execute(key, operation, policy);
    } catch (err: unknown) {
      throw this.toActionableError(err, key);
    }
  }

  /** Delegates the shared per-call timeout helper so callers keep one policy source. */
  withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return this.resilienceService.withTimeout(promise, timeoutMs);
  }

  /** Fetches a Horizon account record under the resilient policy. */
  getAccount(address: string) {
    return this.execute('horizon.account', () =>
      this.server.accounts().accountId(address).call(),
    );
  }

  /** Fetches a transaction record by hash under the resilient policy. */
  getTransaction(hash: string) {
    return this.execute('horizon.transaction', () =>
      this.server.transactions().transaction(hash).call(),
    );
  }

  /**
   * Submits a signed transaction envelope (XDR) and returns only after Horizon
   * accepted it; envelopes rejected by the network raise `ThirdPartyApiError`
   * so callers never treat an unconfirmed submission as successful (#1531).
   */
  async submitTransaction(xdr: string) {
    const transaction = StellarSdk.TransactionBuilder.fromXDR(
      xdr,
      this.networkPassphrase,
    );
    const result = await this.execute('horizon.submit', () =>
      this.server.submitTransaction(transaction),
    );
    if (!result.successful) {
      throw new ThirdPartyApiError(
        `Stellar transaction ${result.hash} was rejected by the network ` +
          `(ledger ${result.ledger}). Fix the transaction envelope and resubmit.`,
        'horizon.submit',
        1,
      );
    }
    return result;
  }

  private toActionableError(err: unknown, key: string): ThirdPartyApiError {
    if (err instanceof ThirdPartyApiError) {
      const remedy =
        err.attempts === 0
          ? ` Horizon circuit "${key}" is open; calls fail fast for ~30s while it ` +
            `recovers — retry shortly and check the configured horizon URL.`
          : ` Check connectivity to the configured horizon URL, then retry.`;
      return new ThirdPartyApiError(
        `${err.message}${remedy}`,
        err.downstream,
        err.attempts,
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return new ThirdPartyApiError(
      `Stellar Horizon call "${key}" failed: ${message}`,
      key,
      1,
    );
  }
}
