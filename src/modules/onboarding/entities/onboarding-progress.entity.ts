import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * One onboarding step a user completes.
 */
export interface OnboardingStep {
  id: string;
  label: string;
  required: boolean;
  done: boolean;
  completedAt: string | null;
}

/**
 * Default onboarding checklist shown to new users.
 */
export const DEFAULT_ONBOARDING_STEPS: Array<Omit<OnboardingStep, 'done' | 'completedAt'>> = [
  { id: 'profile', label: 'Complete your profile', required: true },
  { id: 'verify_email', label: 'Verify your email address', required: true },
  { id: 'preferences', label: 'Choose notification preferences', required: false },
  { id: 'first_task', label: 'Complete your first health task', required: true },
  { id: 'explore', label: 'Explore the dashboard', required: false },
];

/**
 * Per-user onboarding progress (#1378). `steps` stores the checklist with
 * per-step completion timestamps; `completed`/`completedAt` mark the moment
 * every required step was done.
 */
@Entity('onboarding_progress')
@Index(['userId'])
@Index(['completedAt'])
export class OnboardingProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  userId: string;

  @Column({ type: 'jsonb' })
  steps: OnboardingStep[];

  /** Index of the step the user should tackle next. */
  @Column({ type: 'int', default: 0 })
  currentStep: number;

  @Column({ type: 'boolean', default: false })
  completed: boolean;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}