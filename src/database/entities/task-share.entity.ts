import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { HealthTask } from '../../entities/health-task.entity';
import { User } from '../../entities/user.entity';

export enum SharePermission {
  VIEW = 'view',
  EDIT = 'edit',
}

@Entity('task_shares')
@Unique(['taskId', 'sharedWithId'])
export class TaskShare {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => HealthTask, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taskId' })
  task: HealthTask;

  @Column()
  taskId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'sharedById' })
  sharedBy: User;

  @Column()
  sharedById: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'sharedWithId' })
  sharedWith: User;

  @Column()
  sharedWithId: string;

  @Column({
    type: 'enum',
    enum: SharePermission,
    default: SharePermission.VIEW,
  })
  permission: SharePermission;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
