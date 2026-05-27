import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  ANALYTICS_PROVIDERS,
  AnalyticsService,
  ConsoleAnalyticsProvider,
  ExternalAnalyticsProvider,
} from './analytics.service';

@Module({
  imports: [ConfigModule],
  providers: [
    AnalyticsService,
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
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
