import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Consultation } from './entities/consultation.entity';
import { HealerAvailability } from './entities/availability.entity';
import { ConsultationsService } from './consultations.service';
import { ConsultationsController } from './consultations.controller';
import { QueueService } from '../../shared/queue/queue.service';

@Module({
  imports: [TypeOrmModule.forFeature([Consultation, HealerAvailability])],
  controllers: [ConsultationsController],
  providers: [ConsultationsService, QueueService],
  exports: [ConsultationsService],
})
export class ConsultationsModule {}
