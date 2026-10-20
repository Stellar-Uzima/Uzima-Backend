import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { StellarService } from './stellar.service';
import {
  StellarTransactionRecord,
  StellarTransactionStatus,
  StellarTransactionType
} from './entities/stellar-transaction-record.entity';
import { TrackStellarTransactionDto } from './dto/track-stellar-transaction.dto';

@Injectable()
export class StellarTransactionTrackingService {
  private readonly logger = new Logger(StellarTransactionTrackingService.name);

  constructor(
    private readonly stellarService: StellarService,
    @InjectDataSource() private readonly dataSource: DataSource
  ) {}

  private get repository() {
    return this.dataSource.getRepository(StellarTransactionRecord);
  }

  /**
   * Records a submitted transaction under its unique network hash.
   * Idempotent: re-submissions of the same hash return the existing row and
   * only fill in previously missing ownership/amount fields.
   */
  async trackTransaction(
    dto: TrackStellarTransactionDto,
    userId: string
  ): Promise<StellarTransactionRecord> {
    const hash = dto.hash.toLowerCase();
    const existing = await this.repository.findOne({ where: { hash } });
    if (existing) {
      let changed = false;
      if (!existing.userId) {
        existing.userId = userId;
        changed = true;
      }
      if (dto.amount !== undefined && existing.amount === null) {
        existing.amount = dto.amount;
        changed = true;
      }
      if (dto.counterpartAddress && !existing.counterpartAddress) {
        existing.counterpartAddress = dto.counterpartAddress;
        changed = true;
      }
      if (changed) {
        return this.repository.save(existing);
      }
      return existing;
    }

    const record = this.repository.create({
      hash,
      userId,
      type: dto.type ?? StellarTransactionType.OTHER,
      status: StellarTransactionStatus.SUBMITTED,
      ledgerSequence: null,
      amount: dto.amount ?? null,
      counterpartAddress: dto.counterpartAddress ?? null,
      rawResponse: null,
      submittedAt: new Date(),
      confirmedAt: null,
    });
    try {
      this.logger.log(`Stellar transaction tracked: ${hash} by user ${userId}`);
      return await this.repository.save(record);
    } catch {
      // Concurrent submission of the same hash — return the winning row.
      const winner = await this.repository.findOne({ where: { hash } });
      if (winner) {
        return winner;
      }
      throw new BadRequestException('Failed to record Stellar transaction');
    }
  }

  /**
   * Refreshes a tracked record's lifecycle status from Horizon.
   * Terminal states (CONFIRMED/FAILED) are never overwritten, so repeated
   * polls are idempotent. When the transaction is unknown to the network the
   * record is marked NOT_FOUND and can be refreshed again later.
   */
  async refreshStatus(hash: string, userId: string): Promise<StellarTransactionRecord> {
    const normalized = hash.toLowerCase();
    const record = await this.repository.findOne({ where: { hash: normalized, userId } });
    if (!record) {
      throw new NotFoundException('Stellar transaction record not found');
    }
    if (
      record.status === StellarTransactionStatus.CONFIRMED ||
      record.status === StellarTransactionStatus.FAILED
    ) {
      return record;
    }

    const details = await this.stellarService.getTransactionDetails(normalized);
    if (!details) {
      record.status = StellarTransactionStatus.NOT_FOUND;
      return this.repository.save(record);
    }

    record.ledgerSequence = details.ledger ?? null;
    if (!record.counterpartAddress && details.to) {
      record.counterpartAddress = details.to;
    }
    record.rawResponse = {
      successful: details.successful,
      sourceAccount: details.sourceAccount,
      fee: details.fee,
      createdAt: details.createdAt,
      to: details.to,
      envelopeXdr: details.envelopeXdr,
      resultXdr: details.resultXdr,
    };
    record.status = details.successful
      ? StellarTransactionStatus.CONFIRMED
      : StellarTransactionStatus.FAILED;
    record.confirmedAt = new Date(details.createdAt);
    this.logger.log(`Stellar transaction ${record.hash} refreshed to ${record.status}`);
    return this.repository.save(record);
  }

  /**
   * Returns the authenticated user's tracked record for a hash, or null.
   * Other users' records are never visible.
   */
  async getRecord(hash: string, userId: string): Promise<StellarTransactionRecord | null> {
    return this.repository.findOne({ where: { hash: hash.toLowerCase(), userId } });
  }
}
