import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Consultation } from './entities/consultation.entity';
import { ConsultationsService } from './consultations.service';
import { ConsultationsController } from './consultations.controller';
import { QueueService } from '../../shared/queue/queue.service';

@Module({
  imports: [TypeOrmModule.forFeature([Consultation])],
  controllers: [ConsultationsController],
  providers: [ConsultationsService, QueueService],
  exports: [ConsultationsService],
})
export class ConsultationsModule {}
import { Module } from '@nestjs/common'; @Module({}) export class ConsultationsModule {}
