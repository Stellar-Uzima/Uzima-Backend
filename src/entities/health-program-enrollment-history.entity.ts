import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { HealthProgramEnrollmentState } from '../modules/health-program-enrollment/enums/health-program-enrollment-state.enum';

@Entity('health_program_enrollment_history')
@Index('IDX_health_program_enrollment_history_user_program_changed', [
  'userId',
  'programCode',
  'changedAt',
])
export class HealthProgramEnrollmentHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 100 })
  programCode: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  previousState: HealthProgramEnrollmentState | null;

  @Column({ type: 'varchar', length: 20 })
  newState: HealthProgramEnrollmentState;

  @Column({ type: 'uuid' })
  changedBy: string;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn({ type: 'timestamp' })
  changedAt: Date;
}
