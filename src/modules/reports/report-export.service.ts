import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PassThrough } from 'stream';
import { RewardTransaction } from '@/rewards/entities/reward-transaction.entity';

@Injectable()
export class ReportExportService {
  private readonly logger = new Logger(ReportExportService.name);

  constructor(
    @InjectRepository(RewardTransaction)
    private readonly rewardTransactionRepository: Repository<RewardTransaction>,
  ) {}

  streamRewardsCsv(userId?: string): PassThrough {
    const stream = new PassThrough();
    const headers = ['id', 'userId', 'amount', 'status', 'stellarTxHash', 'createdAt'];
    stream.write(headers.join(',') + '\n');

    const queryBuilder = this.rewardTransactionRepository
      .createQueryBuilder('rt')
      .orderBy('rt.createdAt', 'DESC');

    if (userId) {
      queryBuilder.where('rt.userId = :userId', { userId });
    }

    queryBuilder
      .stream()
      .then((cursor) => {
        cursor.on('data', (row: Record<string, unknown>) => {
          const line = [
            row['rt_id'] ?? '',
            row['rt_userId'] ?? '',
            row['rt_amount'] ?? '',
            row['rt_status'] ?? '',
            row['rt_stellarTxHash'] ?? '',
            row['rt_createdAt'] ?? '',
          ]
            .map((value) => `"${String(value).replace(/"/g, '""')}"`)
            .join(',');

          stream.write(line + '\n');
        });

        cursor.on('end', () => {
          this.logger.log('CSV export stream completed');
          stream.end();
        });

        cursor.on('error', (err: Error) => {
          this.logger.error('CSV export stream error', err.message);
          stream.destroy(err);
        });
      })
      .catch((err: Error) => {
        this.logger.error('Failed to open CSV export cursor', err.message);
        stream.destroy(err);
      });

    return stream;
  }
}
