import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from '../../entities/user.entity';
import { CustomerSegment } from './customer-segment.entity';

@Entity('user_segment_memberships')
@Unique(['userId', 'segmentId'])
@Index(['segmentId'])
@Index(['userId'])
export class UserSegmentMembership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid' })
  @Index()
  segmentId: string;

  @ManyToOne(() => CustomerSegment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'segmentId' })
  segment: CustomerSegment;

  /**
   * Timestamp when the user was matched to this segment.
   * Used for tracking when membership was established.
   */
  @Column({ type: 'timestamp', default: () => 'now()' })
  matchedAt: Date;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;
}
