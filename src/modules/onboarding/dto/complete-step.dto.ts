import { IsString, IsNotEmpty } from 'class-validator';

/**
 * Marks a single onboarding step as completed.
 */
export class CompleteStepDto {
  @IsString()
  @IsNotEmpty()
  stepId: string;
}