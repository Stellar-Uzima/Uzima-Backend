import { Request, Response } from 'express';
import { RequestIdMiddleware, asyncLocalStorage } from './request-id.middleware';

describe('RequestIdMiddleware', () => {
  let middleware: RequestIdMiddleware;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFn: jest.Mock;

  beforeEach(() => {
    middleware = new RequestIdMiddleware();
    nextFn = jest.fn();
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      setHeader: jest.fn(),
    };
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  it('generates a new UUID v4 when X-Request-ID header is not present', (done) => {
    mockRequest.headers = {};

    middleware.use(
      mockRequest as Request,
      mockResponse as Response,
      nextFn,
    );

    setTimeout(() => {
      expect(mockRequest.headers['x-request-id']).toBeDefined();
      expect(mockRequest.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(nextFn).toHaveBeenCalled();
      done();
    });
  });

  it('uses the client-supplied X-Request-ID when present', (done) => {
    const clientRequestId = 'client-supplied-request-id-123';
    mockRequest.headers = { 'x-request-id': clientRequestId };

    middleware.use(
      mockRequest as Request,
      mockResponse as Response,
      nextFn,
    );

    setTimeout(() => {
      expect(mockRequest.headers['x-request-id']).toBe(clientRequestId);
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'x-request-id',
        clientRequestId,
      );
      expect(nextFn).toHaveBeenCalled();
      done();
    });
  });

  it('sets X-Request-ID response header', (done) => {
    mockRequest.headers = {};

    middleware.use(
      mockRequest as Request,
      mockResponse as Response,
      nextFn,
    );

    setTimeout(() => {
      expect(mockResponse.setHeader).toHaveBeenCalled();
      const setHeaderCalls = (mockResponse.setHeader as jest.Mock).mock.calls;
      const requestIdCall = setHeaderCalls.find(
        (call: unknown[]) => (call[0] as string) === 'x-request-id',
      );
      expect(requestIdCall).toBeDefined();
      expect(requestIdCall[1]).toBe(mockRequest.headers['x-request-id']);
      done();
    });
  });

  it('stores request ID in AsyncLocalStorage', (done) => {
    mockRequest.headers = {};

    middleware.use(
      mockRequest as Request,
      mockResponse as Response,
      nextFn,
    );

    setTimeout(() => {
      const store = asyncLocalStorage.getStore();
      expect(store).toBeDefined();
      expect(store.requestId).toBe(mockRequest.headers['x-request-id']);
      done();
    });
  });

  it('calls next() to continue the middleware chain', (done) => {
    mockRequest.headers = {};

    middleware.use(
      mockRequest as Request,
      mockResponse as Response,
      nextFn,
    );

    setTimeout(() => {
      expect(nextFn).toHaveBeenCalledTimes(1);
      done();
    });
  });
});
