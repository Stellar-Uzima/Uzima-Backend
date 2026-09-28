import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  OnboardingProgress,
  OnboardingStep,
  DEFAULT_ONBOARDING_STEPS,
} from './entities/onboarding-progress.entity';

/**
 * Guides new users through the first-time experience (#1378): an initialized
 * checklist, per-step completion tracking and a percentage-driven progress
 * model the client can render as a "get started" widget.
 */
@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @InjectRepository(OnboardingProgress)
    private readonly progressRepo: Repository<OnboardingProgress>,
  ) {}

  /**
   * Returns (or lazily initializes) the onboarding checklist for a user.
   */
  async getProgress(userId: string): Promise<OnboardingProgress> {
    let progress = await this.progressRepo.findOne({ where: { userId } });
    if (!progress) {
      progress = await this.initialize(userId);
    }
    return this.enrich(userId, progress);
  }

  /**
   * Marks a step complete and advances the current-step pointer.
   */
  async completeStep(userId: string, stepId: string): Promise<OnboardingProgress> {
    let progress = await this.progressRepo.findOne({ where: { userId } });
    if (!progress) {
      progress = await this.initialize(userId);
    }

    const step = progress.steps.find((s) => s.id === stepId);
    if (!step) {
      throw new BadRequestException(`Unknown onboarding step: ${stepId}`);
    }

    if (!step.done) {
      step.done = true;
      step.completedAt = new Date().toISOString();
      await this.progressRepo.update(progress.id, {
        steps: progress.steps,
        currentStep: this.nextIndex(progress.steps),
        completed: this.allRequiredDone(progress.steps),
        completedAt: this.allRequiredDone(progress.steps) ? new Date() : progress.completedAt,
      });
      this.logger.log(`Onboarding step completed userId=${userId} step=${stepId}`);
    }

    return this.enrich(userId, await this.progressRepo.findOne({ where: { userId } }));
  }

  /**
   * Forces completion of every required step (idempotent).
   */
  async completeAll(userId: string): Promise<OnboardingProgress> {
    let progress = await this.progressRepo.findOne({ where: { userId } });
    if (!progress) {
      progress = await this.initialize(userId);
    }

    const now = new Date().toISOString();
    const steps = progress.steps.map((s) => ({
      ...s,
      done: true,
      completedAt: s.completedAt ?? now,
    }));

    await this.progressRepo.update(progress.id, {
      steps,
      currentStep: steps.length,
      completed: true,
      completedAt: new Date(),
    });

    return this.enrich(userId, await this.progressRepo.findOne({ where: { userId } }));
  }

  /**
   * Whether the user finished every required onboarding step.
   */
  async isCompleted(userId: string): Promise<{ completed: boolean }> {
    const progress = await this.getProgress(userId);
    return { completed: progress.completed };
  }

  private async initialize(userId: string): Promise<OnboardingProgress> {
    const created = await this.progressRepo.save(
      this.progressRepo.create({
        userId,
        steps: DEFAULT_ONBOARDING_STEPS.map((s) => ({
          ...s,
          done: false,
          completedAt: null,
        })),
        currentStep: 0,
        completed: false,
        completedAt: null,
      }),
    );
    this.logger.log(`Onboarding initialized for user ${userId}`);
    return created;
  }

  private enrich(userId: string, progress: OnboardingProgress): OnboardingProgress {
    (progress as unknown as Record<string, unknown>).completionPercent =
      this.completionPercent(progress.steps);
    (progress as unknown as Record<string, unknown>).nextStep =
      progress.steps[progress.currentStep]?.id ?? null;
    return progress;
  }

  private nextIndex(steps: OnboardingStep[]): number {
    const idx = steps.findIndex((s) => !s.done);
    return idx === -1 ? steps.length : idx;
  }

  private allRequiredDone(steps: OnboardingStep[]): boolean {
    return steps.every((s) => !s.required || s.done);
  }

  private completionPercent(steps: OnboardingStep[]): number {
    if (steps.length === 0) return 0;
    const done = steps.filter((s) => s.done).length;
    return Math.round((done / steps.length) * 100);
  }
}