import { MonitoringController } from './monitoring.controller';
import { PrometheusController } from '@willsoto/nestjs-prometheus';

describe('MonitoringController', () => {
  it('extends PrometheusController for metrics exposition', () => {
    const controller = new MonitoringController();
    expect(controller).toBeInstanceOf(PrometheusController);
  });

  it('returns Prometheus metrics via index', async () => {
    const controller = new MonitoringController();
    const response = { header: jest.fn() };
    const metricsSpy = jest
      .spyOn(PrometheusController.prototype, 'index')
      .mockResolvedValue('# HELP http_requests_total\n');

    const result = await controller.getMetrics(response as any);

    expect(metricsSpy).toHaveBeenCalledWith(response);
    expect(result).toContain('http_requests_total');
    metricsSpy.mockRestore();
  });
});
