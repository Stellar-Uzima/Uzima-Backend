import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Between, DataSource, IsNull, Not } from 'typeorm';
import StellarSdk from 'stellar-sdk';
import {
  ResilienceService,
  RetryPolicyOptions
} from '../shared/resilience/resilience.service';
import { StellarService } from './stellar.service';
import { StellarTransactionRecord } from './entities/stellar-transaction-record.entity';
import {
  WalletTransaction,
  WalletTransactionType
} from '@database/entities/wallet-transaction.entity';

/** One row of a reconciliation report; always traceable by hash. */
export interface ReconciliationEntry {
  hash: string;
  amount: string | null;
  memo: string | null;
  internalTxId: string | null;
  status: string;
}

export interface ReconciliationReport {
  treasury: string;
  from: string;
  to: string;
  matched: ReconciliationEntry[];
  unmatched: ReconciliationEntry[];
  orphaned: ReconciliationEntry[];
  summary: {
    onChain: number;
    matched: number;
    unmatched: number;
    orphaned: number;
    truncated: boolean;
  };
}

interface HorizonPaymentRecord {
  type: string;
  from: string;
  to: string;
  amount: string;
  transaction_hash: string;
  created_at: string;
  paging_token: string;
}

interface HorizonTransactionRecord {
  hash: string;
  memo?: string | null;
  created_at: string;
  paging_token: string;
}

const MAX_PAGES = 10;
const PAGE_SIZE = 200;

/**
 * Compares confirmed Stellar network activity around the treasury account
 * with platform payment records. Report-only: balances are never mutated.
 */
@Injectable()
export class StellarReconciliationService {
  private readonly logger = new Logger(StellarReconciliationService.name);

  private readonly horizonPolicy: RetryPolicyOptions = {
    attempts: 3,
    baseDelayMs: 250,
    maxDelayMs: 4000,
    timeoutMs: 10_000,
    circuit: { failureThreshold: 5, openDurationMs: 30_000 },
  };

  constructor(
    private readonly stellarService: StellarService,
    private readonly resilienceService: ResilienceService,
    @InjectDataSource() private readonly dataSource: DataSource
  ) {}

  /**
   * Reconciles treasury-account payments on the network against
   * `stellar_transaction_records` and wallet top-ups in the given window.
   *
   * - matched: on-chain incoming payment with a known internal reference
   * - unmatched: on-chain incoming payment with no internal reference
   * - orphaned: internal record without on-chain evidence
   *
   * Duplicated or amount-mismatched internals are flagged in `status`.
   */
  async reconcile(from: Date, to: Date): Promise<ReconciliationReport> {
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid reconciliation window');
    }
    if (from.getTime() >= to.getTime()) {
      throw new BadRequestException('"from" must be before "to"');
    }

    const treasury = this.resolveTreasuryAccount();
    const { payments, truncated: paymentsTruncated } = await this.fetchPayments(
      treasury,
      from,
      to
    );
    const { memoByHash, truncated: memosTruncated } = await this.fetchMemos(
      treasury,
      from,
      to
    );

    const records = await this.dataSource
      .getRepository(StellarTransactionRecord)
      .find({ where: { createdAt: Between(from, to) } });
    const topups = await this.dataSource.getRepository(WalletTransaction).find({
      where: {
        type: WalletTransactionType.DEPOSIT,
        stellarTxHash: Not(IsNull()),
        createdAt: Between(from, to),
      },
    });

    const recordByHash = new Map<string, StellarTransactionRecord[]>();
    for (const record of records) {
      const hash = record.hash.toLowerCase();
      const bucket = recordByHash.get(hash) ?? [];
      bucket.push(record);
      recordByHash.set(hash, bucket);
    }
    const topupByHash = new Map<string, WalletTransaction[]>();
    for (const topup of topups) {
      const hash = (topup.stellarTxHash ?? '').toLowerCase();
      if (!hash) continue;
      const bucket = topupByHash.get(hash) ?? [];
      bucket.push(topup);
      topupByHash.set(hash, bucket);
    }

    const matched: ReconciliationEntry[] = [];
    const unmatched: ReconciliationEntry[] = [];
    const onChainHashes = new Set<string>();

    for (const payment of payments) {
      const hash = payment.transaction_hash.toLowerCase();
      if (!hash) continue;
      onChainHashes.add(hash);
      if (payment.to.toLowerCase() !== treasury.toLowerCase()) {
        // Outgoing/other-direction payments only feed orphan detection.
        continue;
      }

      const internalRecords = recordByHash.get(hash) ?? [];
      const internalTopups = topupByHash.get(hash) ?? [];
      const internalTxId = internalTopups[0]?.id ?? internalRecords[0]?.id ?? null;
      const status = this.classifyStatus(payment.amount, internalRecords, internalTopups);
      const entry: ReconciliationEntry = {
        hash,
        amount: payment.amount,
        memo: memoByHash.get(hash) ?? null,
        internalTxId,
        status,
      };
      if (internalTxId) {
        matched.push(entry);
      } else {
        unmatched.push(entry);
      }
    }

    const orphaned: ReconciliationEntry[] = [];
    const orphanHashes = new Set<string>();
    for (const hash of [...recordByHash.keys(), ...topupByHash.keys()]) {
      if (onChainHashes.has(hash) || orphanHashes.has(hash)) continue;
      orphanHashes.add(hash);
      const record = recordByHash.get(hash)?.[0];
      const topup = topupByHash.get(hash)?.[0];
      const internalAmount = topup?.amount ?? record?.amount;
      orphaned.push({
        hash,
        amount:
          internalAmount !== null && internalAmount !== undefined
            ? String(internalAmount)
            : null,
        memo: memoByHash.get(hash) ?? null,
        internalTxId: topup?.id ?? record?.id ?? null,
        status: `ORPHANED:${record?.status ?? topup?.status ?? 'UNKNOWN'}`,
      });
    }

    const truncated = paymentsTruncated || memosTruncated;

    this.logger.log(
      `Reconciliation ${from.toISOString()}..${to.toISOString()} for ${treasury}: ` +
        `${matched.length} matched, ${unmatched.length} unmatched, ${orphaned.length} orphaned`
    );

    return {
      treasury,
      from: from.toISOString(),
      to: to.toISOString(),
      matched,
      unmatched,
      orphaned,
      summary: {
        onChain: onChainHashes.size,
        matched: matched.length,
        unmatched: unmatched.length,
        orphaned: orphaned.length,
        truncated,
      },
    };
  }

  private classifyStatus(
    chainAmount: string,
    records: StellarTransactionRecord[],
    topups: WalletTransaction[]
  ): string {
    // Duplicate payment rows for one hash are the true "duplicated" case;
    // a tracking record plus its top-up is a normal join, not a duplicate.
    if (topups.length > 1 || records.length > 1) {
      return 'DUPLICATED';
    }
    const internalAmount = topups[0]?.amount ?? records[0]?.amount;
    if (
      internalAmount !== null &&
      internalAmount !== undefined &&
      Math.abs(parseFloat(chainAmount) - Number(internalAmount)) > 1e-7
    ) {
      return 'AMOUNT_MISMATCH';
    }
    return String(topups[0]?.status ?? records[0]?.status ?? 'MATCHED');
  }

  private resolveTreasuryAccount(): string {
    const direct = (
      process.env.STELLAR_TREASURY_PUBLIC_KEY ??
      process.env.STELLAR_TREASURY_ADDRESS ??
      ''
    ).trim();
    if (StellarSdk.StrKey.isValidEd25519PublicKey(direct)) {
      return direct;
    }
    const secret = (process.env.STELLAR_TREASURY_SECRET_KEY ?? '').trim();
    if (secret) {
      try {
        const derived = StellarSdk.Keypair.fromSecret(secret).publicKey();
        if (StellarSdk.StrKey.isValidEd25519PublicKey(derived)) {
          return derived;
        }
      } catch {
        // Malformed secret; fall through to the configuration error below.
      }
    }
    throw new BadRequestException(
      'Stellar treasury account is not configured (set STELLAR_TREASURY_PUBLIC_KEY or STELLAR_TREASURY_SECRET_KEY)'
    );
  }

  private get server(): InstanceType<typeof StellarSdk.Horizon.Server> {
    return new StellarSdk.Horizon.Server(this.stellarService.getHorizonUrl());
  }

  /**
   * Pages through account payments (newest first) and keeps those inside the
   * window. Pagination is bounded; `truncated` signals a best-effort report.
   */
  private async fetchPayments(
    treasury: string,
    from: Date,
    to: Date
  ): Promise<{ payments: HorizonPaymentRecord[]; truncated: boolean }> {
    const payments: HorizonPaymentRecord[] = [];
    let cursor: string | undefined;
    let truncated = false;

    for (let page = 0; page < MAX_PAGES; page++) {
      const builder = this.server
        .payments()
        .forAccount(treasury)
        .order('desc')
        .limit(PAGE_SIZE);
      if (cursor) {
        builder.cursor(cursor);
      }
      const response = await this.resilienceService.execute(
        'horizon.reconciliation.payments',
        () => builder.call(),
        this.horizonPolicy
      );
      const records = response.records as unknown as HorizonPaymentRecord[];
      if (records.length === 0) {
        return { payments, truncated };
      }
      let reachedOld = false;
      for (const record of records) {
        const createdAt = new Date(record.created_at);
        if (createdAt.getTime() < from.getTime()) {
          reachedOld = true;
          break;
        }
        if (
          createdAt.getTime() <= to.getTime() &&
          record.type === 'payment' &&
          typeof record.transaction_hash === 'string'
        ) {
          payments.push(record);
        }
      }
      if (reachedOld) {
        return { payments, truncated };
      }
      cursor = records[records.length - 1].paging_token;
      if (page === MAX_PAGES - 1) {
        truncated = true;
      }
    }
    return { payments, truncated };
  }

  /**
   * Builds a hash → memo map from account transactions inside the window.
   */
  private async fetchMemos(
    treasury: string,
    from: Date,
    to: Date
  ): Promise<{ memoByHash: Map<string, string>; truncated: boolean }> {
    const memoByHash = new Map<string, string>();
    let cursor: string | undefined;
    let truncated = false;

    for (let page = 0; page < MAX_PAGES; page++) {
      const builder = this.server
        .transactions()
        .forAccount(treasury)
        .order('desc')
        .limit(PAGE_SIZE);
      if (cursor) {
        builder.cursor(cursor);
      }
      const response = await this.resilienceService.execute(
        'horizon.reconciliation.transactions',
        () => builder.call(),
        this.horizonPolicy
      );
      const records = response.records as unknown as HorizonTransactionRecord[];
      if (records.length === 0) {
        return { memoByHash, truncated };
      }
      let reachedOld = false;
      for (const record of records) {
        const createdAt = new Date(record.created_at);
        if (createdAt.getTime() < from.getTime()) {
          reachedOld = true;
          break;
        }
        if (
          createdAt.getTime() <= to.getTime() &&
          record.hash &&
          typeof record.memo === 'string' &&
          record.memo.length > 0
        ) {
          memoByHash.set(record.hash.toLowerCase(), record.memo);
        }
      }
      if (reachedOld) {
        return { memoByHash, truncated };
      }
      cursor = records[records.length - 1].paging_token;
      if (page === MAX_PAGES - 1) {
        truncated = true;
      }
    }
    return { memoByHash, truncated };
  }
}
