import { RequestIdMiddleware, REQUEST_ID_HEADER } from './request-id.middleware';
import { Request, Response } from 'express';

describe('RequestIdMiddleware', () => {
  let middleware: RequestIdMiddleware;

  beforeEach(() => {
    middleware = new RequestIdMiddleware();
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  it('should set X-Request-ID header on response', () => {
    const req = { headers: {} } as Request;
    const setHeader = jest.fn();
    const res = { setHeader } as unknown as Response;
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, expect.any(String));
    expect(next).toHaveBeenCalled();
  });

  it('should reuse existing request ID from incoming header', () => {
    const existingId = 'existing-request-id';
    const req = { headers: { 'x-request-id': existingId } } as unknown as Request;
    const setHeader = jest.fn();
    const res = { setHeader } as unknown as Response;
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, existingId);
    expect((req as any).requestId).toBe(existingId);
  });

  it('should generate a new UUID when no request ID provided', () => {
    const req = { headers: {} } as Request;
    const setHeader = jest.fn();
    const res = { setHeader } as unknown as Response;
    const next = jest.fn();

    middleware.use(req, res, next);

    const requestId = (req as any).requestId;
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});