import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Record of a completed reward redemption settled with reward points.
 * One row per successful claim; linked ledger entry uses this id as eventRef.
 */
@Entity('reward_point_redemptions')
@Index(['userId'])
export class RewardPointRedemption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  catalogItemId: string;

  @Column({ type: 'int' })
  pointsSpent: number;

  @Column({ type: 'varchar', length: 32, default: 'COMPLETED' })
  status: string;

  @CreateDateColumn({ type: 'timestamp with time zone', precision: 6 })
  createdAt: Date;
}
