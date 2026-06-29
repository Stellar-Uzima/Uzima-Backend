
import { Test, TestingModule } from '@nestjs/testing';
import { RequestSigningGuard } from './request-signing.guard';
import { SigningService } from './signing.service';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { createMock } from '@golevelup/ts-jest';

describe('RequestSigningGuard', () => {
  let guard: RequestSigningGuard;
  let signingService: jest.Mocked<SigningService>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequestSigningGuard,
        {
          provide: SigningService,
          useValue: {
            isTimestampValid: jest.fn(),
            verifySignature: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<RequestSigningGuard>(RequestSigningGuard);
    signingService = module.get(SigningService);
    configService = module.get(ConfigService);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  const mockExecutionContext = (headers: any, body: any = {}, method = 'POST', path = '/test') => {
    return createMock<ExecutionContext>({
      switchToHttp: () => ({
        getRequest: () => ({
          headers,
          body,
          method,
          path,
        }),
      }),
    });
  };

  describe('canActivate', () => {
    it('should throw UnauthorizedException if signing headers are missing', async () => {
      const context = mockExecutionContext({});
      await expect(guard.canActivate(context)).rejects.toThrow(new UnauthorizedException('Missing signing headers'));
    });

    it('should throw UnauthorizedException for invalid timestamp format', async () => {
        const headers = { 'x-signature': 'sig', 'x-timestamp': 'not-a-number', 'x-key-id': 'key' };
        const context = mockExecutionContext(headers);
        await expect(guard.canActivate(context)).rejects.toThrow(new UnauthorizedException('Invalid timestamp format'));
    });

    it('should throw UnauthorizedException if timestamp is invalid', async () => {
      const headers = { 'x-signature': 'sig', 'x-timestamp': '12345', 'x-key-id': 'key' };
      const context = mockExecutionContext(headers);
      signingService.isTimestampValid.mockReturnValue(false);
      await expect(guard.canActivate(context)).rejects.toThrow(new UnauthorizedException('Request timestamp expired or invalid'));
    });

    it('should throw UnauthorizedException if key ID is invalid', async () => {
        const headers = { 'x-signature': 'sig', 'x-timestamp': '12345', 'x-key-id': 'invalid-key' };
        const context = mockExecutionContext(headers);
        signingService.isTimestampValid.mockReturnValue(true);
        configService.get.mockReturnValue(undefined);
        await expect(guard.canActivate(context)).rejects.toThrow(new UnauthorizedException('Invalid Key ID'));
    });

    it('should throw UnauthorizedException if signature is invalid', async () => {
        const timestamp = Math.floor(Date.now() / 1000);
        const headers = { 'x-signature': 'invalid-sig', 'x-timestamp': timestamp.toString(), 'x-key-id': 'key' };
        const context = mockExecutionContext(headers);
        
        signingService.isTimestampValid.mockReturnValue(true);
        configService.get.mockReturnValue('secret');
        signingService.verifySignature.mockReturnValue(false);

        await expect(guard.canActivate(context)).rejects.toThrow(new UnauthorizedException('Invalid request signature'));
    });

    it('should return true if signature is valid', async () => {
        const timestamp = Math.floor(Date.now() / 1000);
        const headers = { 'x-signature': 'valid-sig', 'x-timestamp': timestamp.toString(), 'x-key-id': 'key' };
        const context = mockExecutionContext(headers);

        signingService.isTimestampValid.mockReturnValue(true);
        configService.get.mockReturnValue('secret');
        signingService.verifySignature.mockReturnValue(true);

        const result = await guard.canActivate(context);
        expect(result).toBe(true);
    });
  });
});