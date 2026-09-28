import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { ReferralService } from './referral.service';
import { User } from '../entities/user.entity';
import { ReferralRecord } from './entities/referral-record.entity';
import { AntiAbuseService } from '../modules/anti-abuse/anti-abuse.service';
import { ReferralRewardSettlementService } from './referral-reward-settlement.service';
import { ReferralQualifyingAction } from './referral-reward.constants';

describe('ReferralService & DTO Validation (Issue #1055, #1305)', () => {
  let service: ReferralService;
  let userRepoMock: any;
  let referralRepoMock: any;
  let antiAbuseServiceMock: any;
  let settlementServiceMock: any;

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
    antiAbuseServiceMock = {
      assertReferralClaimAllowed: jest.fn().mockResolvedValue(undefined),
      recordClaimAttempt: jest.fn().mockResolvedValue(undefined),
    };
    settlementServiceMock = {
      settleReferralReward: jest.fn(),
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
        {
          provide: AntiAbuseService,
          useValue: antiAbuseServiceMock,
        },
        {
          provide: ReferralRewardSettlementService,
          useValue: settlementServiceMock,
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
      expect(antiAbuseServiceMock.assertReferralClaimAllowed).toHaveBeenCalledWith(
        referrerId,
        userId,
        { referralCode: 'REF456' },
      );
    });
  });

  describe('handleFirstHealthTaskCompletion', () => {
    it('delegates settlement to the referral reward settlement service', async () => {
      settlementServiceMock.settleReferralReward.mockResolvedValue({
        settled: true,
        reason: 'SETTLED',
        settlementId: 'settlement-1',
      });

      const result = await service.handleFirstHealthTaskCompletion('user-789');

      expect(
        settlementServiceMock.settleReferralReward,
      ).toHaveBeenCalledWith({
        referredUserId: 'user-789',
        qualifyingAction:
          ReferralQualifyingAction.FIRST_HEALTH_TASK_COMPLETION,
      });
      expect(result.settled).toBe(true);
    });
  });
});
