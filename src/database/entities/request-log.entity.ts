import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('request_logs')
@Index(['method', 'path'])
@Index(['statusCode'])
@Index(['createdAt'])
export class RequestLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  method: string;

  @Column()
  path: string;

  @Column({ type: 'jsonb', nullable: true })
  headers: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  body: Record<string, any>;

  @Column({ nullable: true })
  userAgent?: string;

  @Column({ nullable: true })
  ip?: string;

  @Column({ nullable: true })
  userId?: string;

  @Column()
  statusCode: number;

  @Column({ type: 'jsonb', nullable: true })
  response: Record<string, any>;

  @Column({ type: 'int' })
  responseTime: number; // in milliseconds

  @Column({ nullable: true })
  error?: string;

  @CreateDateColumn()
  createdAt: Date;
}
