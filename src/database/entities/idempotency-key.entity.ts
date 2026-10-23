import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('idempotency_keys')
@Index(['userId', 'method', 'path', 'key'], { unique: true })
export class IdempotencyKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  key: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userId: string | null;

  @Column({ length: 16 })
  method: string;

  @Column({ length: 512 })
  path: string;

  @Column({ length: 128 })
  requestHash: string;

  @Column({ type: 'integer', default: 200 })
  statusCode: number;

  @Column({ type: 'jsonb', nullable: true })
  responseBody: any;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp' })
  expiresAt: Date;
}
