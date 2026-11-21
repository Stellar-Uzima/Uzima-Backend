import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { HealthProgramEnrollmentState } from '../modules/health-program-enrollment/enums/health-program-enrollment-state.enum';

@Entity('health_program_enrollments')
@Index('UQ_health_program_enrollments_user_program', ['userId', 'programCode'], {
  unique: true,
})
export class HealthProgramEnrollment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 100 })
  programCode: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: HealthProgramEnrollmentState.PENDING,
  })
  state: HealthProgramEnrollmentState;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
