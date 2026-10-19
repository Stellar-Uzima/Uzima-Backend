import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Append-only ledger of reward point movements. Positive `delta` earns
 * points, negative `delta` spends them; `balanceAfter` snapshots the running
 * balance at write time. Rows are never updated or deleted — the balance is
 * always derivable as SUM(delta) per user. The (userId, eventRef) unique
 * index makes award/spend operations idempotent per source event.
 */
@Entity('reward_points_ledger')
@Index(['userId', 'eventRef'], { unique: true })
@Index(['userId'])
export class RewardPointsLedger {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'int' })
  delta: number;

  @Column({ type: 'int' })
  balanceAfter: number;

  @Column({ type: 'varchar', length: 64 })
  action: string;

  @Column({ type: 'varchar', length: 128 })
  eventRef: string;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone', precision: 6 })
  createdAt: Date;
}
