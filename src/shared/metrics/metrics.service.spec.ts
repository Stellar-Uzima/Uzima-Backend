import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  const counter = () => ({ inc: jest.fn() });
  const histogram = () => ({ observe: jest.fn() });
  const gauge = () => ({ set: jest.fn() });

  const httpRequestsTotal = counter();
  const httpRequestsSuccessTotal = counter();
  const httpRequestsFailedTotal = counter();
  const httpRequestDuration = histogram();
  const dbQueriesTotal = counter();
  const dbQueryDuration = histogram();
  const cacheHitsTotal = counter();
  const cacheMissesTotal = counter();
  const memoryUsage = gauge();
  const cpuUsage = gauge();

  beforeEach(() => {
    service = new MetricsService(
      httpRequestsTotal as any,
      httpRequestsSuccessTotal as any,
      httpRequestsFailedTotal as any,
      httpRequestDuration as any,
      dbQueriesTotal as any,
      dbQueryDuration as any,
      cacheHitsTotal as any,
      cacheMissesTotal as any,
      memoryUsage as any,
      cpuUsage as any,
    );
    jest.clearAllMocks();
  });

  it('increments success counter for 2xx responses', () => {
    service.incrementHttpRequests('GET', '/health', 200);

    expect(httpRequestsTotal.inc).toHaveBeenCalledWith({
      method: 'GET',
      route: '/health',
      status_code: '200',
    });
    expect(httpRequestsSuccessTotal.inc).toHaveBeenCalledWith({
      method: 'GET',
      route: '/health',
    });
    expect(httpRequestsFailedTotal.inc).not.toHaveBeenCalled();
  });

  it('increments failed counter for 4xx/5xx responses', () => {
    service.incrementHttpRequests('POST', '/auth/login', 401);

    expect(httpRequestsFailedTotal.inc).toHaveBeenCalledWith({
      method: 'POST',
      route: '/auth/login',
      status_code: '401',
    });
    expect(httpRequestsSuccessTotal.inc).not.toHaveBeenCalled();
  });

  it('records request duration histogram in seconds', () => {
    service.recordHttpRequestDuration('GET', '/users', 1.25);

    expect(httpRequestDuration.observe).toHaveBeenCalledWith(
      { method: 'GET', route: '/users' },
      1.25,
    );
  });
});
