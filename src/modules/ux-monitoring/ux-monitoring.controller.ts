import { Controller, Get } from '@nestjs/common';
import { UxHealthMonitorService } from './ux-health-monitor.service';

/**
 * Read surface for UX health: current status and recent degradation events.
 */
@Controller('ux-monitoring')
export class UxMonitoringController {
  constructor(private readonly uxHealthMonitor: UxHealthMonitorService) {}

  @Get('health')
  getHealth() {
    return this.uxHealthMonitor.getHealthSummary();
  }

  @Get('evaluate')
  async evaluate() {
    await this.uxHealthMonitor.evaluate();
    return this.uxHealthMonitor.getHealthSummary();
  }
}