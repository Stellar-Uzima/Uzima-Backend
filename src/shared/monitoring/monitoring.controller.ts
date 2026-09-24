import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrometheusController } from '@willsoto/nestjs-prometheus';
import { Response } from 'express';
import { CacheService, CacheStats } from '../cache/cache.service';

@ApiTags('monitoring')
@Controller()
export class MonitoringController extends PrometheusController {
  constructor(private readonly cacheService: CacheService) {
    super();
  }

  @Get()
  @ApiOperation({ summary: 'Prometheus metrics endpoint' })
  @ApiResponse({ status: 200, description: 'Prometheus text exposition format' })
  async getMetrics(@Res({ passthrough: true }) response: Response): Promise<string> {
    return super.index(response);
  }

  @Get('cache/stats')
  @ApiOperation({ summary: 'Get cache statistics' })
  @ApiResponse({ status: 200, description: 'Cache performance metrics' })
  async getCacheStats(): Promise<CacheStats> {
    return this.cacheService.getStats();
  }
}
