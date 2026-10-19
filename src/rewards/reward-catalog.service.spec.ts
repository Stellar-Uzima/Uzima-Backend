import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { User } from '../entities/user.entity';
import { WalletService } from '../modules/wallet/wallet.service';
import {
  RewardCatalog,
  RewardCatalogStatus,
  RewardType,
} from './entities/reward-catalog.entity';
import { RewardTransaction } from './entities/reward-transaction.entity';
import { RewardCatalogService } from './reward-catalog.service';

describe('RewardCatalogService', () => {
  let service: RewardCatalogService;

  const persisted = {
    reward: {
      id: 'reward-1',
      type: RewardType.XLM,
      status: RewardCatalogStatus.ACTIVE,
      stock: 1,
      redeemedCount: 0,
      cost: 2,
      title: 'Test reward',
    },
    user: { id: 'user-1', walletBalance: 10 },
    transactions: [] as Record<string, unknown>[],
  };
  const catalogRepository = { findOne: jest.fn() };
  const rewardRepository = {};
  const userRepository = { findOne: jest.fn() };
  const eventEmitter = { emit: jest.fn() };
  const walletService = { getWalletSummary: jest.fn() };

  const dataSource = {
    transaction: jest.fn(async (work) => {
      const staged = {
        reward: { ...persisted.reward },
        user: { ...persisted.user },
        transactions: [...persisted.transactions],
      };
      const manager = {
        getRepository: (entity: unknown) => {
          if (entity === RewardCatalog) {
            return {
              findOne: jest.fn(async () => staged.reward),
              save: jest.fn(async () => {
                throw new Error('injected catalog write failure');
              }),
            };
          }
          if (entity === RewardTransaction) {
            return {
              create: jest.fn((value) => ({ ...value, id: 'transaction-1' })),
              save: jest.fn(async (value) => {
                staged.transactions.push(value);
                return value;
              }),
            };
          }
          if (entity === User) {
            return {
              findOne: jest.fn(async () => staged.user),
              save: jest.fn(async (value) => {
                staged.user = value;
                return value;
              }),
            };
          }
          throw new Error('Unexpected repository');
        },
      };

      const result = await work(manager);
      Object.assign(persisted, staged);
      return result;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    persisted.reward.stock = 1;
    persisted.reward.redeemedCount = 0;
    persisted.user.walletBalance = 10;
    persisted.transactions.length = 0;
    catalogRepository.findOne.mockResolvedValue(persisted.reward);
    userRepository.findOne.mockResolvedValue(persisted.user);
    walletService.getWalletSummary.mockResolvedValue({
      walletLinked: true,
      liveBalance: '10',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RewardCatalogService,
        { provide: getRepositoryToken(RewardCatalog), useValue: catalogRepository },
        { provide: getRepositoryToken(RewardTransaction), useValue: rewardRepository },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: WalletService, useValue: walletService },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    service = module.get(RewardCatalogService);
  });

  it('rolls back ledger and balance changes when a later redemption write fails', async () => {
    await expect(
      service.redeem('user-1', { rewardId: 'reward-1' }),
    ).rejects.toThrow('injected catalog write failure');

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(persisted.transactions).toHaveLength(0);
    expect(persisted.user.walletBalance).toBe(10);
    expect(persisted.reward.stock).toBe(1);
    expect(persisted.reward.redeemedCount).toBe(0);
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });
});
