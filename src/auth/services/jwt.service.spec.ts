
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

import { JwtTokenService } from './jwt.service';

jest.mock('jsonwebtoken');

const mockJwt = jwt as jest.Mocked<typeof jwt>;

describe('JwtTokenService', () => {
  let service: JwtTokenService;
  let module: TestingModule;

  const mockConfig = {
    get: jest.fn((key: string, defaultValue = '') => {
      const config: Record<string, string> = {
        JWT_PRIVATE_KEY: 'private-key',
        JWT_PUBLIC_KEY: 'public-key',
      };

      return config[key] ?? defaultValue;
    }),
  };

  const mockUserPayload = {
    sub: 'u1',
    email: 'a@b.com',
    role: 'user',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      providers: [
        JwtTokenService,
        {
          provide: ConfigService,
          useValue: mockConfig,
        },
      ],
    }).compile();

    service = module.get<JwtTokenService>(JwtTokenService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('generateAccessToken', () => {
    it('should sign an access token using RS256 with a 15-minute expiry', () => {
      const expectedToken = 'access-token';

      mockJwt.sign.mockReturnValue(expectedToken);

      const token = service.generateAccessToken(mockUserPayload);

      expect(mockJwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: mockUserPayload.sub,
        }),
        'private-key',
        expect.objectContaining({
          algorithm: 'RS256',
          expiresIn: '15m',
        }),
      );

      expect(token).toBe(expectedToken);
    });
  });

  describe('generateRefreshToken', () => {
    it('should sign a refresh token using a 7-day expiry', () => {
      const expectedToken = 'refresh-token';

      mockJwt.sign.mockReturnValue(expectedToken);

      const token = service.generateRefreshToken(mockUserPayload);

      expect(mockJwt.sign).toHaveBeenCalledWith(
        expect.anything(),
        'private-key',
        expect.objectContaining({
          expiresIn: '7d',
        }),
      );

      expect(token).toBe(expectedToken);
    });
  });
});
