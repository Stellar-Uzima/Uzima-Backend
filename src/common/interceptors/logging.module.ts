import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggingInterceptor } from './logging.interceptor';
import { RequestLog } from '../../database/entities/request-log.entity';
import { LoggingModule as SharedLoggingModule } from '../../shared/logging/logging.module';

@Module({
  imports: [TypeOrmModule.forFeature([RequestLog]), SharedLoggingModule],
  providers: [LoggingInterceptor],
  exports: [LoggingInterceptor],
})
export class LoggingModule {}
