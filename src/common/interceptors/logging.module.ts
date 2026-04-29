import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggingInterceptor } from './logging.interceptor';
import { RequestLog } from '../../database/entities/request-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RequestLog])],
  providers: [LoggingInterceptor],
  exports: [LoggingInterceptor],
})
export class LoggingModule {}
