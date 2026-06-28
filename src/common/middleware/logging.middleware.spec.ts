
import { LoggingMiddleware } from './logging.middleware';
import { Request, Response, NextFunction } from 'express';
import * as winston from 'winston';

jest.mock('winston', () => ({
  createLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    json: jest.fn(),
    colorize: jest.fn(),
    printf: jest.fn(),
  },
  transports: {
    Console: jest.fn(),
  },
}));

describe('LoggingMiddleware', () => {
  let middleware: LoggingMiddleware;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;
  let logger: winston.Logger;

  beforeEach(() => {
    middleware = new LoggingMiddleware();
    logger = (middleware as any).logger;
    mockRequest = {
      method: 'GET',
      originalUrl: '/test',
      headers: {},
      body: { data: 'test' },
    };
    mockResponse = {
      on: jest.fn((event, callback) => {
        if (event === 'finish') {
          (callback as () => void)();
        }
        return mockResponse as Response;
      }),
      setHeader: jest.fn(),
      statusCode: 200,
    };
    nextFunction = jest.fn();
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  it('should log info for successful requests', () => {
    middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);
    expect(logger.info).toHaveBeenCalled();
  });

  it('should log a warning for 4xx client errors', () => {
    mockResponse.statusCode = 404;
    middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('should log an error for 5xx server errors', () => {
    mockResponse.statusCode = 500;
    middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);
    expect(logger.error).toHaveBeenCalled();
  });

  it('should add a request ID to headers', () => {
    middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);
    expect(mockRequest.headers['x-request-id']).toBeDefined();
    expect(mockResponse.setHeader).toHaveBeenCalledWith('x-request-id', expect.any(String));
  });

  it('should redact body for auth routes', () => {
    mockRequest.originalUrl = '/auth/login';
    middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);
    expect(logger.info).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      body: '[REDACTED]',
    }));
  });

  it('should skip logging for health check endpoints', () => {
    mockRequest.originalUrl = '/health';
    middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);
    expect(logger.info).not.toHaveBeenCalled();
    expect(nextFunction).toHaveBeenCalledTimes(1);
  });
});