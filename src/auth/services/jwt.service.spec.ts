jest.mock('jsonwebtoken');

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtTokenService } from './jwt.service';
import * as jwt from 'jsonwebtoken';

const mockJwt = jwt as jest.Mocked<typeof jwt>;

describe('JwtTokenService', () => {
  let service: JwtTokenService;
  const mockConfig = {
    get: jest.fn((key: string, def = '') => {
      if (key === 'JWT_PRIVATE_KEY') return 'private-key';
      if (key === 'JWT_PUBLIC_KEY') return 'public-key';
      return def;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtTokenService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get<JwtTokenService>(JwtTokenService);
  });

  it('should be defined', () => { expect(service).toBeDefined(); });

  it('generateAccessToken signs with RS256 and 15m expiry', () => {
    (mockJwt.sign as jest.Mock).mockReturnValue('access-token');
    const token = service.generateAccessToken({ sub: 'u1', email: 'a@b.com', role: 'user' });
    expect(mockJwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'u1' }),
      'private-key',
      expect.objectContaining({ algorithm: 'RS256', expiresIn: '15m' }),
    );
    expect(token).toBe('access-token');
  });

  it('generateRefreshToken signs with 7d expiry', () => {
    (mockJwt.sign as jest.Mock).mockReturnValue('refresh-token');
    const token = service.generateRefreshToken({ sub: 'u1', email: 'a@b.com', role: 'user' });
    expect(mockJwt.sign).toHaveBeenCalledWith(
      expect.anything(), 'private-key',
      expect.objectContaining({ expiresIn: '7d' }),
    );
    expect(token).toBe('refresh-token');
  });
});
