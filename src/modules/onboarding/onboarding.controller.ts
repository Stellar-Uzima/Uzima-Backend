import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { CompleteStepDto } from './dto/complete-step.dto';

/**
 * Read/write surface for the onboarding checklist.
 */
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get(':userId')
  getProgress(@Param('userId') userId: string) {
    return this.onboardingService.getProgress(userId);
  }

  @Get(':userId/completed')
  isCompleted(@Param('userId') userId: string) {
    return this.onboardingService.isCompleted(userId);
  }

  @Post(':userId/step')
  completeStep(@Param('userId') userId: string, @Body() dto: CompleteStepDto) {
    return this.onboardingService.completeStep(userId, dto.stepId);
  }

  @Post(':userId/complete')
  completeAll(@Param('userId') userId: string) {
    return this.onboardingService.completeAll(userId);
  }
}