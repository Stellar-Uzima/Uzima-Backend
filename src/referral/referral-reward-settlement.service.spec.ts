import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { ReferralRewardSettlementService } from './referral-reward-settlement.service';
import type { SettleReferralRewardParams } from './referral-reward-settlement.service';
import { ReferralRecord } from './entities/referral-record.entity';
import { ReferralRewardSettlement } from './entities/referral-reward-settlement.entity';
import { RewardTransaction } from '../rewards/entities/reward-transaction.entity';
import { RewardStatus } from '../rewards/enums/reward-status.enum';
import { User } from '../entities/user.entity';
import { UserStatus } from '../modules/auth/enums/user-status.enum';
import { AntiAbuseService } from '../modules/anti-abuse/anti-abuse.service';
import { Currency } from '../shared/currency/currency.enum';
import {
  ReferralQualifyingAction,
  ReferralSettlementReason,
} from './referral-reward.constants';

const REFERRER_ID = 'referrer-1';
const REFERRED_ID = 'referred-1';
const REFERRAL_ID = 'ref-1';

const buildReferral = (overrides: Partial<ReferralRecord> = {}) =>
  ({
    id: REFERRAL_ID,
    rewardPaid: false,
    rewardPaidAt: null,
    referrer: { id: REFERRER_ID },
    referred: { id: REFERRED_ID },
    ...overrides,
  }) as unknown as ReferralRecord;

describe('ReferralRewardSettlementService', () => {
  let service: ReferralRewardSettlementService;
  let referralRepo: any;
  let settlementRepo: any;
  let rewardRepo: any;
  let userRepo: any;
  let manager: any;
  let dataSource: any;
  let antiAbuseService: any;
  let eventEmitter: any;
  let configService: any;

  const compileService = async (configuredAmount = 5) => {
    configService = {
      get: jest.fn(() => configuredAmount),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferralRewardSettlementService,
        {
          provide: getRepositoryToken(ReferralRewardSettlement),
          useValue: settlementRepo,
        },
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: DataSource, useValue: dataSource },
        { provide: AntiAbuseService, useValue: antiAbuseService },
        { provide: ConfigService, useValue: configService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    return module.get<ReferralRewardSettlementService>(
      ReferralRewardSettlementService,
    );
  };

  beforeEach(async () => {
    referralRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (entity) => entity),
    };
    settlementRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({
        ...value,
        id: 'settlement-1',
        settledAt: value.settledAt ?? new Date('2024-03-01T00:00:00.000Z'),
        createdAt: new Date('2024-03-01T00:00:00.000Z'),
      })),
    };
    rewardRepo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ ...value, id: 'tx-1' })),
    };
    userRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: REFERRER_ID,
        status: UserStatus.ACTIVE,
      }),
    };

    manager = {
      getRepository: jest.fn((entity) => {
        if (entity === ReferralRecord) return referralRepo;
        if (entity === ReferralRewardSettlement) return settlementRepo;
        if (entity === RewardTransaction) return rewardRepo;
        if (entity === User) return userRepo;
        throw new Error(`Unexpected repository request: ${entity?.name}`);
      }),
    };
    dataSource = {
      transaction: jest.fn((_isolation, work) => work(manager)),
    };
    antiAbuseService = {
      assertRewardClaimAllowed: jest.fn().mockResolvedValue(undefined),
    };
    eventEmitter = { emit: jest.fn() };

    service = await compileService();
  });

  const settle = (overrides: Partial<SettleReferralRewardParams> = {}) =>
    service.settleReferralReward({
      referredUserId: REFERRED_ID,
      qualifyingAction: ReferralQualifyingAction.FIRST_HEALTH_TASK_COMPLETION,
      ...overrides,
    });

  it('settles an eligible referral and records the reward transaction', async () => {
    referralRepo.findOne.mockResolvedValue(buildReferral());
    settlementRepo.findOne.mockResolvedValue(null);

    const result = await settle();

    expect(result).toMatchObject({
      settled: true,
      reason: ReferralSettlementReason.SETTLED,
      settlementId: 'settlement-1',
      rewardTransactionId: 'tx-1',
      referrerId: REFERRER_ID,
      amount: 5,
      currency: Currency.XLM,
    });
    expect(result.settledAt).toBeInstanceOf(Date);

    expect(rewardRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user: { id: REFERRER_ID },
        amount: 5,
        currency: Currency.XLM,
        status: RewardStatus.PENDING,
      }),
    );
    expect(rewardRepo.save).toHaveBeenCalledTimes(1);

    expect(settlementRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        referralId: REFERRAL_ID,
        referrerId: REFERRER_ID,
        referredId: REFERRED_ID,
        qualifyingAction:
          ReferralQualifyingAction.FIRST_HEALTH_TASK_COMPLETION,
        rewardTransactionId: 'tx-1',
      }),
    );
    expect(settlementRepo.save).toHaveBeenCalledTimes(1);

    const savedReferral = referralRepo.save.mock.calls[0][0];
    expect(savedReferral.rewardPaid).toBe(true);
    expect(savedReferral.rewardPaidAt).toBeInstanceOf(Date);

    expect(antiAbuseService.assertRewardClaimAllowed).toHaveBeenCalledWith(
      REFERRER_ID,
      5,
      REFERRAL_ID,
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'reward.earned',
      expect.objectContaining({ userId: REFERRER_ID, rewardTransactionId: 'tx-1' }),
    );
  });

  it('is idempotent when the referral is already marked paid', async () => {
    referralRepo.findOne.mockResolvedValue(
      buildReferral({ rewardPaid: true, rewardPaidAt: new Date() }),
    );
    settlementRepo.findOne.mockResolvedValue(null);

    const result = await settle();

    expect(result.settled).toBe(false);
    expect(result.reason).toBe(ReferralSettlementReason.ALREADY_SETTLED);
    expect(result.idempotent).toBe(true);
    expect(rewardRepo.create).not.toHaveBeenCalled();
    expect(rewardRepo.save).not.toHaveBeenCalled();
    expect(settlementRepo.save).not.toHaveBeenCalled();
    expect(referralRepo.save).not.toHaveBeenCalled();
  });

  it('is idempotent when a settlement row exists even if the flag is stale', async () => {
    referralRepo.findOne.mockResolvedValue(buildReferral());
    settlementRepo.findOne.mockResolvedValue({
      id: 'settlement-9',
      referralId: REFERRAL_ID,
      referrerId: REFERRER_ID,
      rewardTransactionId: 'tx-9',
      amount: '7.5',
      currency: Currency.XLM,
      settledAt: new Date('2024-02-02T00:00:00.000Z'),
    });

    const result = await settle();

    expect(result).toMatchObject({
      settled: false,
      reason: ReferralSettlementReason.ALREADY_SETTLED,
      idempotent: true,
      settlementId: 'settlement-9',
      rewardTransactionId: 'tx-9',
      amount: 7.5,
    });
    expect(rewardRepo.save).not.toHaveBeenCalled();
    // The stale flag is repaired from the ledger row.
    expect(referralRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ rewardPaid: true }),
    );
  });

  it('does not settle when the user never redeemed a referral', async () => {
    referralRepo.findOne.mockResolvedValue(null);

    const result = await settle();

    expect(result).toMatchObject({
      settled: false,
      reason: ReferralSettlementReason.NO_REFERRAL,
    });
    expect(rewardRepo.create).not.toHaveBeenCalled();
  });

  it('rejects a non-qualifying action before touching the database', async () => {
    const result = await settle({ qualifyingAction: 'SIGNED_UP' });

    expect(result).toMatchObject({
      settled: false,
      reason: ReferralSettlementReason.INELIGIBLE_ACTION,
    });
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects invalid reward amounts', async () => {
    const result = await settle({ amount: 0 });

    expect(result).toMatchObject({
      settled: false,
      reason: ReferralSettlementReason.INVALID_AMOUNT,
    });
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects self-referrals', async () => {
    referralRepo.findOne.mockResolvedValue(
      buildReferral({
        referrer: { id: 'same-user' } as any,
        referred: { id: 'same-user' } as any,
      }),
    );
    settlementRepo.findOne.mockResolvedValue(null);

    const result = await settle();

    expect(result).toMatchObject({
      settled: false,
      reason: ReferralSettlementReason.INELIGIBLE_SELF_REFERRAL,
    });
    expect(rewardRepo.create).not.toHaveBeenCalled();
  });

  it('rejects when the referrer account is no longer active', async () => {
    referralRepo.findOne.mockResolvedValue(buildReferral());
    settlementRepo.findOne.mockResolvedValue(null);
    userRepo.findOne.mockResolvedValue({
      id: REFERRER_ID,
      status: UserStatus.SUSPENDED,
    });

    const result = await settle();

    expect(result).toMatchObject({
      settled: false,
      reason: ReferralSettlementReason.INELIGIBLE_REFERRER,
    });
    expect(rewardRepo.create).not.toHaveBeenCalled();
  });

  it('propagates anti-abuse rejections and pays nothing', async () => {
    referralRepo.findOne.mockResolvedValue(buildReferral());
    settlementRepo.findOne.mockResolvedValue(null);
    antiAbuseService.assertRewardClaimAllowed.mockRejectedValue(
      new BadRequestException('Too many reward claims in a short period'),
    );

    await expect(settle()).rejects.toThrow(BadRequestException);
    expect(rewardRepo.save).not.toHaveBeenCalled();
    expect(settlementRepo.save).not.toHaveBeenCalled();
  });

  it('treats a duplicate-key race as already settled', async () => {
    referralRepo.findOne.mockResolvedValue(buildReferral());
    settlementRepo.findOne.mockResolvedValue(null);
    settlementRepo.save.mockRejectedValue(
      new QueryFailedError('INSERT', [], {
        code: '23505',
        message: 'duplicate key value violates unique constraint',
      } as any),
    );

    const result = await settle();

    expect(result).toMatchObject({
      settled: false,
      reason: ReferralSettlementReason.ALREADY_SETTLED,
      idempotent: true,
    });
    expect(settlementRepo.save).toHaveBeenCalledTimes(1);
  });

  it('honours an explicit amount and currency override', async () => {
    referralRepo.findOne.mockResolvedValue(buildReferral());
    settlementRepo.findOne.mockResolvedValue(null);

    const result = await settle({ amount: 12.5, currency: Currency.USDC });

    expect(result).toMatchObject({
      settled: true,
      amount: 12.5,
      currency: Currency.USDC,
    });
    expect(rewardRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 12.5, currency: Currency.USDC }),
    );
  });

  it('uses the configured default reward amount when REFERRAL_REWARD_XLM is set', async () => {
    referralRepo.findOne.mockResolvedValue(buildReferral());
    settlementRepo.findOne.mockResolvedValue(null);
    service = await compileService(9);

    const result = await settle();

    expect(result).toMatchObject({ settled: true, amount: 9 });
    expect(rewardRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 9 }),
    );
  });

  it('forwards the source reference id into the settlement metadata', async () => {
    referralRepo.findOne.mockResolvedValue(buildReferral());
    settlementRepo.findOne.mockResolvedValue(null);

    await settle({ referenceId: 'completion-42' });

    expect(settlementRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { referenceId: 'completion-42' } }),
    );
  });

  describe('getMyReferralRewards', () => {
    it('returns the referrer ledger, newest first', async () => {
      settlementRepo.find.mockResolvedValue([{ id: 'settlement-1' }]);

      const rows = await service.getMyReferralRewards(REFERRER_ID);

      expect(settlementRepo.find).toHaveBeenCalledWith({
        where: { referrerId: REFERRER_ID },
        order: { createdAt: 'DESC' },
      });
      expect(rows).toHaveLength(1);
    });
  });

  describe('handleTaskVerified', () => {
    it('settles the referral for the verified user', async () => {
      const spy = jest
        .spyOn(service, 'settleReferralReward')
        .mockResolvedValue({
          settled: true,
          reason: ReferralSettlementReason.SETTLED,
        });

      await service.handleTaskVerified({
        userId: REFERRED_ID,
        completionId: 'completion-1',
      });

      expect(spy).toHaveBeenCalledWith({
        referredUserId: REFERRED_ID,
        qualifyingAction:
          ReferralQualifyingAction.FIRST_HEALTH_TASK_COMPLETION,
        referenceId: 'completion-1',
      });
    });

    it('ignores events without a user id', async () => {
      const spy = jest.spyOn(service, 'settleReferralReward');

      await service.handleTaskVerified({});

      expect(spy).not.toHaveBeenCalled();
    });

    it('never throws when settlement fails', async () => {
      jest
        .spyOn(service, 'settleReferralReward')
        .mockRejectedValue(new Error('boom'));

      await expect(
        service.handleTaskVerified({ userId: REFERRED_ID }),
      ).resolves.toBeUndefined();
    });
  });
});
