import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ANALYTICS_PROVIDERS,
  AnalyticsService,
  ConsoleAnalyticsProvider,
  ExternalAnalyticsProvider,
} from './analytics.service';
import { TaskAnalyticsService } from './task-analytics.service';
import { TaskCompletion } from '../../tasks/entities/task-completion.entity';
import { HealthTask } from '../../tasks/entities/health-task.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([TaskCompletion, HealthTask]),
  ],
  providers: [
    AnalyticsService,
    TaskAnalyticsService,
    {
      provide: ANALYTICS_PROVIDERS,
      useFactory: (configService: ConfigService) => [
        new ConsoleAnalyticsProvider(),
        new ExternalAnalyticsProvider(
          configService.get<string>('ANALYTICS_API_KEY'),
          configService.get<string>('ANALYTICS_ENDPOINT', 'https://analytics.example.com/track'),
        ),
      ],
      inject: [ConfigService],
    },
  ],
  exports: [AnalyticsService, TaskAnalyticsService],
})
export class AnalyticsModule {}
