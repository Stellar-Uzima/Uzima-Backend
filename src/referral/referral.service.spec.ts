import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { ReferralService } from './referral.service';
import { User } from '../entities/user.entity';
import { ReferralRecord } from './entities/referral-record.entity';

describe('ReferralService & DTO Validation (Issue #1055)', () => {
  let service: ReferralService;
  let userRepoMock: any;
  let referralRepoMock: any;

  beforeEach(async () => {
    userRepoMock = {
      findOne: jest.fn(),
    };
    referralRepoMock = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((val) => val),
      save: jest.fn((val) => Promise.resolve({ id: 'ref-1', ...val })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferralService,
        {
          provide: getRepositoryToken(User),
          useValue: userRepoMock,
        },
        {
          provide: getRepositoryToken(ReferralRecord),
          useValue: referralRepoMock,
        },
      ],
    }).compile();

    service = module.get<ReferralService>(ReferralService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('redeemReferral', () => {
    it('should reject self-referral attempts with BadRequestException', async () => {
      const userId = 'user-123';
      const selfUser = { id: userId, referralCode: 'SELF123' };

      userRepoMock.findOne
        .mockResolvedValueOnce(selfUser)
        .mockResolvedValueOnce(selfUser);

      await expect(
        service.redeemReferral(userId, {
          userId,
          referralCode: 'SELF123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject malformed or non-existent referral codes', async () => {
      const userId = 'user-123';
      const user = { id: userId, referralCode: 'MYCODE12' };

      userRepoMock.findOne
        .mockResolvedValueOnce(user)
        .mockResolvedValueOnce(null);

      await expect(
        service.redeemReferral(userId, {
          userId,
          referralCode: 'INVALID999',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully redeem valid referral code from another user', async () => {
      const userId = 'user-123';
      const referrerId = 'user-456';
      const user = { id: userId, referralCode: 'USER123' };
      const referrer = { id: referrerId, referralCode: 'REF456' };

      userRepoMock.findOne
        .mockResolvedValueOnce(user)
        .mockResolvedValueOnce(referrer);

      referralRepoMock.findOne.mockResolvedValue(null);

      const result = await service.redeemReferral(userId, {
        userId,
        referralCode: 'REF456',
      });

      expect(result).toBeDefined();
      expect(referralRepoMock.save).toHaveBeenCalled();
    });
  });
});
