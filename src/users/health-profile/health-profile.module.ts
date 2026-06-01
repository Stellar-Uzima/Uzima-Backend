import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthProfile } from '../entities/health-profile.entity';
import { HealthProfileController } from './health-profile.controller';
import { HealthProfileService } from './health-profile.service';

@Module({
  imports: [TypeOrmModule.forFeature([HealthProfile])],
  controllers: [HealthProfileController],
  providers: [HealthProfileService],
  exports: [HealthProfileService],
})
export class HealthProfileModule {}
