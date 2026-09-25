import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { UserSegmentMembership } from './user-segment-membership.entity';

export interface SegmentCriteria {
  // Demographic criteria
  minAge?: number;
  maxAge?: number;
  countries?: string[];
  languages?: string[];
  
  // Behavioral criteria
  minDailyXlmEarned?: number;
  maxDailyXlmEarned?: number;
  hasCompletedTasks?: boolean;
  minTasksCompleted?: number;
  hasStreak?: boolean;
  minStreakDays?: number;
  
  // Engagement criteria
  lastActiveWithinDays?: number;
  hasWalletAddress?: boolean;
  isVerified?: boolean;
  
  // Custom criteria (extensible)
  custom?: Record<string, any>;
}

@Entity('customer_segments')
@Index(['isActive'])
@Index(['lastCalculatedAt'])
export class CustomerSegment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /**
   * Deterministic criteria for segment membership.
   * Users are evaluated against these criteria to determine membership.
   */
  @Column({ type: 'jsonb' })
  criteria: SegmentCriteria;

  @Column({ default: true })
  isActive: boolean;

  /**
   * Cached count of users in this segment.
   * Updated when segment membership is recalculated.
   */
  @Column({ default: 0 })
  memberCount: number;

  /**
   * Timestamp when segment membership was last recalculated.
   */
  @Column({ type: 'timestamp', nullable: true })
  lastCalculatedAt: Date | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @OneToMany(() => UserSegmentMembership, (membership) => membership.segment)
  memberships: UserSegmentMembership[];
}
