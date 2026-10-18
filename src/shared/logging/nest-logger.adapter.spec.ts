import { CustomLogger } from './logger.service';
import { StructuredNestLogger } from './nest-logger.adapter';

describe('StructuredNestLogger', () => {
  const logger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  };
  let adapter: StructuredNestLogger;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new StructuredNestLogger(logger as unknown as CustomLogger);
  });

  it('forwards context and structured metadata to the shared logger', () => {
    adapter.log('service ready', 'Bootstrap', { requestId: 'req-1' });

    expect(logger.log).toHaveBeenCalledWith('service ready', 'Bootstrap', {
      requestId: 'req-1',
    });
  });

  it('preserves stack traces and context for framework errors', () => {
    adapter.error('request failed', 'Error: failed\n    at handler', 'HTTP');

    expect(logger.error).toHaveBeenCalledWith(
      'request failed',
      'Error: failed\n    at handler',
      'HTTP',
      undefined,
    );
  });
});
