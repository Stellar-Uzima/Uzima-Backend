import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Admin-managed configuration of reward point values per action.
 * One row per eligible action (e.g. task.completed, referral.signup).
 */
@Entity('reward_point_rules')
@Index(['action'], { unique: true })
export class RewardPointRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  action: string;

  @Column({ type: 'int' })
  points: number;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone', precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', precision: 6 })
  updatedAt: Date;
}
