import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum BadgeType {
  FIRST_TASK = 'FIRST_TASK',
  STREAK_7 = 'STREAK_7',
  STREAK_30 = 'STREAK_30',
  TASKS_10 = 'TASKS_10',
  TASKS_50 = 'TASKS_50',
  TASKS_100 = 'TASKS_100',
}

@Entity('badges')
export class Badge {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'enum', enum: BadgeType, unique: true }) type: BadgeType;
  @Column() name: string;
  @Column() description: string;
  @Column() iconUrl: string;
  @CreateDateColumn() createdAt: Date;
}