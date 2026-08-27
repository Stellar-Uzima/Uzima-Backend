import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum XpEventType {
  TASK_COMPLETED = 'task_completed',
  STREAK_DAY = 'streak_day',
  BADGE_EARNED = 'badge_earned',
  FIRST_COMPLETION_OF_CATEGORY = 'first_completion_of_category',
  ACHIEVEMENT_UNLOCKED = 'achievement_unlocked',
}

@Entity('xp_transactions')
@Index(['userId'])
@Index(['userId', 'createdAt'])
export class XpTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'int' })
  amount: number;

  @Column({ type: 'varchar', length: 255 })
  reason: string;

  @Column({
    type: 'enum',
    enum: XpEventType,
  })
  sourceEvent: XpEventType;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
