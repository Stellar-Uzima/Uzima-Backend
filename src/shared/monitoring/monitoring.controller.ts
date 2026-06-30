import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrometheusController } from '@willsoto/nestjs-prometheus';
import { Response } from 'express';

@ApiTags('monitoring')
@Controller()
export class MonitoringController extends PrometheusController {
  @Get()
  @ApiOperation({ summary: 'Prometheus metrics endpoint' })
  @ApiResponse({ status: 200, description: 'Prometheus text exposition format' })
  async getMetrics(@Res({ passthrough: true }) response: Response): Promise<string> {
    return super.index(response);
  }
}
