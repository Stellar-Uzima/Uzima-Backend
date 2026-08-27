
import { CsrfMiddleware } from './csrf.middleware';
import { ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

describe('CsrfMiddleware', () => {
  let middleware: CsrfMiddleware;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;
  let cookieSpy: jest.SpyInstance;

  beforeEach(() => {
    middleware = new CsrfMiddleware();
    mockRequest = {
      cookies: {},
      headers: {},
      body: {},
    };
    mockResponse = {
      cookie: jest.fn(),
    };
    nextFunction = jest.fn();
    cookieSpy = jest.spyOn(mockResponse, 'cookie');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  describe('Token Generation', () => {
    it('should generate a token and set cookie if none exists', () => {
      mockRequest.method = 'GET';
      middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);
      
      expect(cookieSpy).toHaveBeenCalledTimes(1);
      expect(cookieSpy).toHaveBeenCalledWith(
        'csrf-token',
        expect.any(String),
        expect.objectContaining({ httpOnly: false, sameSite: 'strict' })
      );
      expect(mockRequest.csrfToken).toBeDefined();
      expect(nextFunction).toHaveBeenCalledTimes(1);
    });

    it('should not generate a new token if one exists in cookies', () => {
      const existingToken = 'existing-token';
      mockRequest.cookies['csrf-token'] = existingToken;
      mockRequest.method = 'GET';

      middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(cookieSpy).not.toHaveBeenCalled();
      expect(mockRequest.csrfToken).toBe(existingToken);
      expect(nextFunction).toHaveBeenCalledTimes(1);
    });
  });

  describe('CSRF Validation', () => {
    const testToken = 'test-csrf-token';

    beforeEach(() => {
        mockRequest.cookies['csrf-token'] = testToken;
        mockRequest.csrfToken = testToken;
    });

    ['GET', 'HEAD', 'OPTIONS'].forEach(method => {
      it(`should skip validation for safe method: ${method}`, () => {
        mockRequest.method = method;
        middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);
        expect(nextFunction).toHaveBeenCalledTimes(1);
      });
    });

    it('should throw ForbiddenException if token is missing for POST request', () => {
      mockRequest.method = 'POST';
      expect(() => middleware.use(mockRequest as Request, mockResponse as Response, nextFunction))
        .toThrow(new ForbiddenException('CSRF token missing'));
    });

    it('should throw ForbiddenException if token is invalid', () => {
      mockRequest.method = 'POST';
      mockRequest.headers['x-csrf-token'] = 'invalid-token';
      expect(() => middleware.use(mockRequest as Request, mockResponse as Response, nextFunction))
        .toThrow(new ForbiddenException('Invalid CSRF token'));
    });

    it('should pass validation with valid token in header', () => {
      mockRequest.method = 'POST';
      mockRequest.headers['x-csrf-token'] = testToken;
      middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);
      expect(nextFunction).toHaveBeenCalledTimes(1);
    });

    it('should pass validation with valid token in body', () => {
        mockRequest.method = 'POST';
        mockRequest.body.csrfToken = testToken;
        middleware.use(mockRequest as Request, mockResponse as Response, nextFunction);
        expect(nextFunction).toHaveBeenCalledTimes(1);
    });
  });
});