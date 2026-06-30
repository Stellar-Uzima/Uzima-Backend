import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { Badge } from './badge.entity';

@Entity('user_badges')
@Unique(['userId', 'badgeId'])
export class UserBadge {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) userId: string;
  @Column({ type: 'uuid' }) badgeId: string;
  @ManyToOne(() => Badge, { eager: true }) @JoinColumn({ name: 'badgeId' }) badge: Badge;
  @CreateDateColumn() awardedAt: Date;
}