
import { Test, TestingModule } from '@nestjs/testing';
import { LoggingInterceptor } from './logging.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RequestLog } from '../../database/entities/request-log.entity';
import { CustomLogger } from '../../shared/logging/logger.service';
import { of, throwError } from 'rxjs';
import { createMock } from '@golevelup/ts-jest';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let mockRequestLogRepository;
  let mockLogger;

  beforeEach(async () => {
    mockRequestLogRepository = {
      create: jest.fn(dto => dto),
      save: jest.fn(log => Promise.resolve(log)),
    };

    mockLogger = {
      logApiRequest: jest.fn(),
      log: jest.fn(),
      logApiError: jest.fn(),
      error: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoggingInterceptor,
        {
          provide: getRepositoryToken(RequestLog),
          useValue: mockRequestLogRepository,
        },
        {
          provide: CustomLogger,
          useValue: mockLogger,
        },
      ],
    }).compile();

    interceptor = module.get<LoggingInterceptor>(LoggingInterceptor);
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  const mockExecutionContext = (requestData: any) => {
    return createMock<ExecutionContext>({
      switchToHttp: () => ({
        getRequest: () => requestData,
        getResponse: () => ({ statusCode: 200 }),
      }),
    });
  };

  const mockCallHandler = (isSuccess: boolean): CallHandler => ({
    handle: () => isSuccess ? of({ data: 'success' }) : throwError(() => new Error('Test error')),
  });

  describe('intercept', () => {
    it('should log request and response on success', (done) => {
      const request = {
        method: 'GET',
        url: '/test',
        headers: { 'user-agent': 'jest' },
        body: { password: 'sensitive' },
        ip: '127.0.0.1',
        user: { id: 'user123' },
      };
      const context = mockExecutionContext(request);
      const callHandler = mockCallHandler(true);

      interceptor.intercept(context, callHandler).subscribe({
        next: () => {
          expect(mockLogger.logApiRequest).toHaveBeenCalled();
          expect(mockLogger.log).toHaveBeenCalled();
          expect(mockRequestLogRepository.save).toHaveBeenCalled();
          const savedLog = mockRequestLogRepository.save.mock.calls[0][0];
          expect(savedLog.body.password).toBe('***MASKED***');
        },
        complete: () => done(),
      });
    });

    it('should log request and error on failure', (done) => {
      const request = {
        method: 'POST',
        url: '/fail',
        headers: { authorization: 'Bearer token' },
        body: {},
        ip: '127.0.0.1',
      };
      const context = mockExecutionContext(request);
      const callHandler = mockCallHandler(false);

      interceptor.intercept(context, callHandler).subscribe({
        error: () => {
          expect(mockLogger.logApiRequest).toHaveBeenCalled();
          expect(mockLogger.logApiError).toHaveBeenCalled();
          expect(mockRequestLogRepository.save).toHaveBeenCalled();
          const savedLog = mockRequestLogRepository.save.mock.calls[0][0];
          expect(savedLog.headers.authorization).toBe('***MASKED***');
          expect(savedLog.error).toBe('Test error');
          done();
        },
      });
    });
  });
});