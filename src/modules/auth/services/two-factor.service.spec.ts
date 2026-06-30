jest.mock('qrcode', () => ({ toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mock') }));
jest.mock('otplib', () => ({ authenticator: { generateSecret: jest.fn().mockReturnValue('MOCKSECRET'), options: {} } }));
jest.mock('bcryptjs', () => ({ hash: jest.fn().mockResolvedValue('$hashed'), compare: jest.fn().mockResolvedValue(true) }));
jest.mock('crypto', () => ({ ...jest.requireActual('crypto'), randomBytes: jest.fn().mockReturnValue(Buffer.from('aabbcc', 'hex')) }));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TwoFactorService } from './two-factor.service';
import { User } from '@/entities/user.entity';
import { TwoFactor } from '@/database/entities/two-factor.entity';
import { NotFoundException } from '@nestjs/common';

describe('TwoFactorService', () => {
  let service: TwoFactorService;
  const mockUserRepo = { findOne: jest.fn() };
  const mockTfRepo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwoFactorService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(TwoFactor), useValue: mockTfRepo },
      ],
    }).compile();
    service = module.get<TwoFactorService>(TwoFactorService);
  });

  it('should be defined', () => { expect(service).toBeDefined(); });

  it('setupTwoFactor throws NotFoundException for unknown user', async () => {
    mockUserRepo.findOne.mockResolvedValue(null);
    await expect(service.setupTwoFactor('bad-id')).rejects.toThrow(NotFoundException);
  });

  it('setupTwoFactor creates a 2FA record for a valid user', async () => {
    mockUserRepo.findOne.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
    mockTfRepo.findOne.mockResolvedValue(null);
    const record = { userId: 'u1', secret: 'MOCKSECRET', enabled: false, backupCodes: [] };
    mockTfRepo.create.mockReturnValue(record);
    mockTfRepo.save.mockResolvedValue({ id: '2fa1', ...record });
    const result = await service.setupTwoFactor('u1');
    expect(mockTfRepo.save).toHaveBeenCalled();
    expect(result).toBeDefined();
  });
});
