import { TransformInterceptor } from './transform.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor<any>;

  beforeEach(() => {
    interceptor = new TransformInterceptor();
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should wrap response in success envelope with timestamp', (done) => {
    const mockData = { id: 1, name: 'test' };
    const mockCallHandler: CallHandler = { handle: () => of(mockData) };
    const mockContext = {} as ExecutionContext;

    interceptor.intercept(mockContext, mockCallHandler).subscribe((result) => {
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockData);
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
      done();
    });
  });

  it('should wrap null data correctly', (done) => {
    const mockCallHandler: CallHandler = { handle: () => of(null) };
    const mockContext = {} as ExecutionContext;

    interceptor.intercept(mockContext, mockCallHandler).subscribe((result) => {
      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
      done();
    });
  });

  it('should wrap array data correctly', (done) => {
    const mockData = [1, 2, 3];
    const mockCallHandler: CallHandler = { handle: () => of(mockData) };
    const mockContext = {} as ExecutionContext;

    interceptor.intercept(mockContext, mockCallHandler).subscribe((result) => {
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockData);
      done();
    });
  });
});