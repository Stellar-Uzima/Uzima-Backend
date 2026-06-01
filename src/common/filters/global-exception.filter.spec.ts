import { GlobalExceptionFilter } from './global-exception.filter';
import { HttpException, HttpStatus, ArgumentsHost } from '@nestjs/common';

function makeHost(url = '/test'): ArgumentsHost {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const getResponse = jest.fn().mockReturnValue({ status });
  const getRequest = jest.fn().mockReturnValue({ url });
  return { switchToHttp: () => ({ getResponse, getRequest }) } as any;
}

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;

  beforeEach(() => { filter = new GlobalExceptionFilter(); });

  it('should be defined', () => { expect(filter).toBeDefined(); });

  it('should return standardized envelope for HttpException', () => {
    const host = makeHost('/api/test');
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    (host.switchToHttp().getResponse as jest.Mock).mockReturnValue({ status });

    filter.catch(new HttpException('Not found', HttpStatus.NOT_FOUND), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 404,
      path: '/api/test',
      timestamp: expect.any(String),
    }));
  });

  it('should return 500 for unknown errors', () => {
    const host = makeHost('/api/err');
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    (host.switchToHttp().getResponse as jest.Mock).mockReturnValue({ status });

    filter.catch(new Error('Unexpected'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 500 }));
  });

  it('should include validation messages array', () => {
    const host = makeHost('/api/validate');
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    (host.switchToHttp().getResponse as jest.Mock).mockReturnValue({ status });

    filter.catch(new HttpException({ message: ['field is required'], error: 'Bad Request' }, 400), host);

    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      message: ['field is required'],
    }));
  });
});