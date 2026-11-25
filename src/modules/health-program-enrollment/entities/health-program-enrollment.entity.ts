import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum HealthProgramEnrollmentStatus {
  PENDING = 'pending',
  INELIGIBLE = 'ineligible',
  ELIGIBLE = 'eligible',
  ENROLLED = 'enrolled',
  WITHDRAWN = 'withdrawn',
}

@Entity('health_program_enrollments')
export class HealthProgramEnrollment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  userId: string;

  @Column({
    type: 'enum',
    enum: HealthProgramEnrollmentStatus,
    enumName: 'health_program_enrollments_status_enum',
    default: HealthProgramEnrollmentStatus.PENDING,
  })
  status: HealthProgramEnrollmentStatus;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}

@Entity('health_program_enrollment_history')
export class HealthProgramEnrollmentHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({
    type: 'enum',
    enum: HealthProgramEnrollmentStatus,
    enumName: 'health_program_enrollments_status_enum',
  })
  fromStatus: HealthProgramEnrollmentStatus;

  @Column({
    type: 'enum',
    enum: HealthProgramEnrollmentStatus,
    enumName: 'health_program_enrollments_status_enum',
  })
  toStatus: HealthProgramEnrollmentStatus;

  @Column({ type: 'uuid', nullable: true })
  changedById: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;
}
