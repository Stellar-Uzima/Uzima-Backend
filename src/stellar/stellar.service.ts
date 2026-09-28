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
}