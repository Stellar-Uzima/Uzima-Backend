import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { BadgeType } from '../../rewards/badges/enums/badge-type.enum';
import { UserBadge } from './user-badge.entity';

@Entity('badges')
@Index(['type'])
export class Badge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  name: string;

  @Column({
    type: 'enum',
    enum: BadgeType,
  })
  type: BadgeType;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  icon?: string;

  @Column({ type: 'int' })
  milestone: number;

  @Column({ type: 'text' })
  milestoneType: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => UserBadge, (userBadge) => userBadge.badge)
  userBadges: UserBadge[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
