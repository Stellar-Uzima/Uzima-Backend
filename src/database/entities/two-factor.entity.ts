import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  Unique,
} from 'typeorm';
import { User } from '../../entities/user.entity';

export type BackupCodeRecord = {
  codeHash: string;
  used: boolean;
};

@Entity('two_factor_auth')
@Unique(['user'])
export class TwoFactor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column('uuid')
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  secret: string;

  @Column({ default: false })
  enabled: boolean;

  @Column({ type: 'json', nullable: true })
  backupCodes: BackupCodeRecord[] | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
