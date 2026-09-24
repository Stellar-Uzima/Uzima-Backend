import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OnboardingProgress } from './entities/onboarding-progress.entity';
import { OnboardingService } from './onboarding.service';
import { OnboardingController } from './onboarding.controller';

/**
 * Wires up the onboarding-experience module.
 */
@Module({
  imports: [TypeOrmModule.forFeature([OnboardingProgress])],
  controllers: [OnboardingController],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}