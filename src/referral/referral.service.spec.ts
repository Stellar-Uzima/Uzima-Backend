import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
<<<<<<< HEAD
import { getQueueToken } from '@nestjs/bull';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ReferralService } from './referral.service';
import { User } from '../entities/user.entity';
import { ReferralRecord } from './entities/referral-record.entity';
import { REWARD_DISTRIBUTION_JOB, REWARD_QUEUE } from '../queue/queue.constants';

describe('ReferralService', () => {
  let service: ReferralService;

  const mockUserRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockReferralRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn(),
  };

  const mockRewardQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
=======
import { BadRequestException, NotFoundException } from '@nestjs/common';
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
>>>>>>> fea048b (feat(backend): consolidate referral module and add test coverage for referral, streaks & webhook verifier (closes #1055, #1056, #1057, #1061))

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferralService,
<<<<<<< HEAD
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        {
          provide: getRepositoryToken(ReferralRecord),
          useValue: mockReferralRepo,
        },
        { provide: getQueueToken(REWARD_QUEUE), useValue: mockRewardQueue },
      ],
    }).compile();

    service = module.get(ReferralService);
  });

  describe('generateReferralCode', () => {
    it('returns existing code when user already has one', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        id: 'user-1',
        referralCode: 'EXISTING',
      });

      const result = await service.generateReferralCode('user-1');

      expect(result).toEqual({ referralCode: 'EXISTING' });
      expect(mockUserRepo.save).not.toHaveBeenCalled();
    });

    it('creates a new unique code', async () => {
      mockUserRepo.findOne
        .mockResolvedValueOnce({ id: 'user-1', referralCode: null })
        .mockResolvedValue(null);
      mockUserRepo.save.mockImplementation((u) => Promise.resolve(u));

      const result = await service.generateReferralCode('user-1');

      expect(result.referralCode).toHaveLength(8);
      expect(mockUserRepo.save).toHaveBeenCalled();
    });
  });

  describe('redeemReferralCode', () => {
    it('links user to referrer', async () => {
      mockUserRepo.findOne
        .mockResolvedValueOnce({ id: 'new-user', referredBy: null })
        .mockResolvedValueOnce({ id: 'referrer', referralCode: 'CODE1234' });
      mockUserRepo.save.mockImplementation((u) => Promise.resolve(u));

      const result = await service.redeemReferralCode('new-user', 'code1234');

      expect(result.referrerId).toBe('referrer');
      expect(mockUserRepo.save).toHaveBeenCalled();
    });

    it('throws when code is invalid', async () => {
      mockUserRepo.findOne
        .mockResolvedValueOnce({ id: 'new-user', referredBy: null })
        .mockResolvedValueOnce(null);

      await expect(
        service.redeemReferralCode('new-user', 'BADCODE1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws when already redeemed', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        id: 'new-user',
        referredBy: { id: 'referrer' },
      });

      await expect(
        service.redeemReferralCode('new-user', 'CODE1234'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('handleFirstHealthTaskCompletion', () => {
    it('queues referral reward on first task for referred user', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        id: 'referred',
        referredBy: { id: 'referrer' },
      });
      mockReferralRepo.findOne.mockResolvedValue(null);
      mockReferralRepo.save.mockImplementation((r) => Promise.resolve(r));

      await service.handleFirstHealthTaskCompletion({
        userId: 'referred',
        completionId: 'completion-1',
      });

      expect(mockRewardQueue.add).toHaveBeenCalledWith(
        REWARD_DISTRIBUTION_JOB,
        expect.objectContaining({
          userId: 'referrer',
          xlmAmount: 1,
        }),
      );
      expect(mockReferralRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ rewardPaid: true }),
      );
    });

    it('skips when user has no referrer', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 'solo', referredBy: null });

      await service.handleFirstHealthTaskCompletion({ userId: 'solo' });

      expect(mockRewardQueue.add).not.toHaveBeenCalled();
=======
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
        .mockResolvedValueOnce(selfUser) // User fetching themselves
        .mockResolvedValueOnce(selfUser); // Referrer query returning self

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
        .mockResolvedValueOnce(null); // Referrer not found

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
>>>>>>> fea048b (feat(backend): consolidate referral module and add test coverage for referral, streaks & webhook verifier (closes #1055, #1056, #1057, #1061))
    });
  });
});
