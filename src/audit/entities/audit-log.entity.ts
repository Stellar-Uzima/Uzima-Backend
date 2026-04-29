import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  VIEW = 'VIEW',
  EXPORT = 'EXPORT',
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  SYSTEM = 'SYSTEM',
}

export enum AuditResource {
  USER = 'USER',
  TASK = 'TASK',
  HEALTH_TASK = 'HEALTH_TASK',
  REMINDER = 'REMINDER',
  REWARD = 'REWARD',
  TRANSACTION = 'TRANSACTION',
  ADMIN = 'ADMIN',
  SYSTEM = 'SYSTEM',
}

@Entity('audit_logs')
@Index(['userId'])
@Index(['resourceType', 'resourceId'])
@Index(['action'])
@Index(['createdAt'])
@Index(['userId', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', nullable: true })
  userId: string | null;

  @Column({ name: 'user_email', nullable: true })
  userEmail: string | null;

  @Column({ name: 'user_role', nullable: true })
  userRole: string | null;

  @Column({
    type: 'enum',
    enum: AuditAction,
    name: 'action',
  })
  action: AuditAction;

  @Column({
    type: 'enum',
    enum: AuditResource,
    name: 'resource_type',
  })
  resourceType: AuditResource;

  @Column({ name: 'resource_id', nullable: true })
  resourceId: string | null;

  @Column({ name: 'resource_name', nullable: true })
  resourceName: string | null;

  @Column({ type: 'jsonb', nullable: true })
  oldValues: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  newValues: Record<string, any> | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ name: 'session_id', type: 'varchar', length: 255, nullable: true })
  sessionId: string | null;

  @Column({ name: 'request_id', type: 'varchar', length: 255, nullable: true })
  requestId: string | null;

  @Column({ name: 'correlation_id', type: 'varchar', length: 255, nullable: true })
  correlationId: string | null;

  @Column({ name: 'tenant_id', type: 'varchar', length: 255, nullable: true })
  tenantId: string | null;

  @Column({ name: 'is_sensitive', type: 'boolean', default: false })
  isSensitive: boolean;

  @Column({ name: 'is_compliance_event', type: 'boolean', default: false })
  isComplianceEvent: boolean;

  @Column({ name: 'compliance_category', type: 'varchar', length: 50, nullable: true })
  complianceCategory: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn({ 
    type: 'timestamp with time zone',
    name: 'created_at',
    precision: 6,
  })
  createdAt: Date;

  // Immutable audit fields
  @Column({ name: 'created_by', type: 'varchar', length: 255, nullable: true })
  createdBy: string | null;

  @Column({ name: 'hash', type: 'varchar', length: 64, unique: true })
  hash: string;

  @Column({ name: 'previous_hash', type: 'varchar', length: 64, nullable: true })
  previousHash: string | null;

  @Column({ name: 'block_index', type: 'int', nullable: true })
  blockIndex: number | null;
}
