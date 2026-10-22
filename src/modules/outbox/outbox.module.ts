import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxEventEntity } from '@database/entities/outbox-event.entity';
import { OutboxService } from './outbox.service';
import { OutboxPublisher } from './outbox.publisher';
import { OutboxProcessor } from './outbox.processor';

@Module({
  imports: [TypeOrmModule.forFeature([OutboxEventEntity])],
  providers: [OutboxService, OutboxPublisher, OutboxProcessor],
  exports: [OutboxService, OutboxPublisher],
})
export class OutboxModule {}
