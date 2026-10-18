import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { User } from '../../entities/user.entity';
import { WalletTransaction } from '../../database/entities/wallet-transaction.entity';
import { WalletTransactionService } from './wallet-transaction.service';
import { WalletService } from './wallet.service';
import { StellarService } from '../../stellar/stellar.service';
import { SavingsService } from './savings.service';

describe('WalletTransactionService transaction boundaries', () => {
  let service: WalletTransactionService;

  const persisted = {
    user: { id: 'user-1', walletBalance: 10 },
    transactions: [] as Record<string, unknown>[],
  };
  const transactionRepository = {};
  const userRepository = {};
  const cacheManager = {};
  const eventEmitter = { emit: jest.fn() };
  const walletService = { invalidateCache: jest.fn() };
  const stellarService = {};
  const savingsService = {};
  const dataSource = {
    transaction: jest.fn(async (work) => {
      const staged = {
        user: { ...persisted.user },
        transactions: [...persisted.transactions],
      };
      const manager = {
        getRepository: (entity: unknown) => {
          if (entity === User) {
            return {
              findOne: jest.fn(async () => staged.user),
              save: jest.fn(async () => {
                throw new Error('injected balance write failure');
              }),
            };
          }
          if (entity === WalletTransaction) {
            return {
              create: jest.fn((value) => ({ ...value, id: 'wallet-tx-1' })),
              save: jest.fn(async (value) => {
                staged.transactions.push(value);
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
    persisted.user.walletBalance = 10;
    persisted.transactions.length = 0;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletTransactionService,
        { provide: getRepositoryToken(WalletTransaction), useValue: transactionRepository },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: 'CACHE_MANAGER', useValue: cacheManager },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: WalletService, useValue: walletService },
        { provide: StellarService, useValue: stellarService },
        { provide: SavingsService, useValue: savingsService },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    service = module.get(WalletTransactionService);
  });

  it('rolls back the ledger row when updating the balance fails', async () => {
    await expect(
      service.recordTransaction({
        userId: 'user-1',
        type: 'deposit' as never,
        amount: 5,
      }),
    ).rejects.toThrow('injected balance write failure');

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(persisted.transactions).toHaveLength(0);
    expect(persisted.user.walletBalance).toBe(10);
    expect(walletService.invalidateCache).not.toHaveBeenCalled();
  });
});
