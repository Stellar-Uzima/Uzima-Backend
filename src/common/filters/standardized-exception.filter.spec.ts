import { BadRequestException, ForbiddenException, HttpStatus, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { StandardizedExceptionFilter } from './standardized-exception.filter';
import { ApiErrorCode } from '../errors/api-error-codes.enum';
import { ApiErrorException } from '../errors/api-error.exception';

describe('StandardizedExceptionFilter (#1292)', () => {
  let filter: StandardizedExceptionFilter;
  let json: jest.Mock;
  let status: jest.Mock;

  const makeHost = () => {
    const request = {
      originalUrl: '/admin/users/directory?bad=1',
      url: '/admin/users/directory?bad=1',
      method: 'GET',
      headers: { 'x-request-id': 'req-123' },
    };
    return {
      switchToHttp: () => ({
        getResponse: () => ({ status, json, headersSent: false }),
        getRequest: () => request,
      }),
    } as never;
  };

  beforeEach(() => {
    filter = new StandardizedExceptionFilter(false);
    json = jest.fn();
    status = jest.fn().mockReturnThis();
  });

  const body = () => json.mock.calls[0][0];

  it('wraps every failure in the same { error } envelope', () => {
    filter.catch(new NotFoundException('User was not found'), makeHost());

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(body().error).toMatchObject({
      code: ApiErrorCode.NOT_FOUND,
      message: 'User was not found',
      statusCode: 404,
      path: '/admin/users/directory?bad=1',
      method: 'GET',
      requestId: 'req-123',
    });
    expect(typeof body().error.timestamp).toBe('string');
  });

  it('preserves an explicit code and details set by a guard', () => {
    const exception = new ForbiddenException({
      code: ApiErrorCode.INSUFFICIENT_ROLE,
      message: 'Requires the ADMIN role',
      details: { required: ['ADMIN'] },
    });

    filter.catch(exception, makeHost());

    expect(status).toHaveBeenCalledWith(403);
    expect(body().error.code).toBe(ApiErrorCode.INSUFFICIENT_ROLE);
    expect(body().error.details).toEqual({ required: ['ADMIN'] });
  });

  it('never leaks the internal message of an unexpected error', () => {
    filter.catch(new Error('connect ECONNREFUSED 10.0.0.5:5432'), makeHost());

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body().error.code).toBe(ApiErrorCode.INTERNAL_ERROR);
    expect(body().error.message).toBe('An unexpected error occurred. Please try again later.');
    expect(JSON.stringify(body())).not.toContain('10.0.0.5');
  });

  it('maps a unique-index violation to 409 instead of 500', () => {
    const error = new QueryFailedError('INSERT ...', [], new Error('duplicate key value'));
    (error as QueryFailedError & { code: string }).code = '23505';

    filter.catch(error, makeHost());

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(body().error.code).toBe(ApiErrorCode.ALREADY_EXISTS);
    expect(body().error.message).not.toContain('duplicate key');
  });

  it('maps malformed JSON to a 400 with a specific code', () => {
    const error = Object.assign(new Error('Unexpected token }'), { type: 'entity.parse.failed' });

    filter.catch(error, makeHost());

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(body().error.code).toBe(ApiErrorCode.MALFORMED_JSON);
  });

  it('flattens CustomValidationPipe errors into a per-field map', () => {
    const exception = new BadRequestException({
      statusCode: 400,
      message: 'Validation failed',
      errors: { limit: ['limit must not exceed 100'] },
    });

    filter.catch(exception, makeHost());

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(body().error.code).toBe(ApiErrorCode.VALIDATION_FAILED);
    expect(body().error.details).toEqual({
      fields: { limit: ['limit must not exceed 100'] },
      errorCount: 1,
    });
  });

  it('renders an ApiErrorException using its code, status and details', () => {
    const exception = new ApiErrorException(
      ApiErrorCode.CANNOT_DEACTIVATE_LAST_ADMIN,
      'Cannot deactivate the last active admin account',
      { details: { remainingAdmins: 0 } },
    );

    filter.catch(exception, makeHost());

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(body().error.code).toBe(ApiErrorCode.CANNOT_DEACTIVATE_LAST_ADMIN);
    expect(body().error.details).toEqual({ remainingAdmins: 0 });
  });

  it('falls back to the code for the status when an error carries no code', () => {
    filter.catch(new NotFoundException(), makeHost());

    expect(body().error.code).toBe(ApiErrorCode.NOT_FOUND);
    expect(typeof body().error.message).toBe('string');
  });
});
