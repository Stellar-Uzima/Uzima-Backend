import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WalletService } from '../../users/wallet/wallet.service';
import { RewardTransaction } from '../../rewards/entities/reward-transaction.entity';
import { User } from '../../entities/user.entity';
import { StellarService } from '../../stellar/stellar.service';
import { XlmPriceService } from '../../stellar/xlm-price.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { formatCurrency } from './utils/format';

const mockRewardTransactionRepo = {
  createQueryBuilder: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getRawOne: jest.fn(),
};

const mockUserRepo = {
  findOne: jest.fn(),
};

const mockStellarService = {
  getAccountBalance: jest.fn(),
};

const mockXlmPriceService = {
  getXlmUsdRate: jest.fn(),
};

const mockEventEmitter = {
  emit: jest.fn(),
};

describe('Wallet module helpers and reconcile', () => {
  it('formatCurrency returns two decimals', () => {
    expect(formatCurrency(1)).toBe('1.00');
    expect(formatCurrency(1.234)).toBe('1.23');
    expect(formatCurrency('2')).toBe('2.00');
  });

  it('reconcile returns summary object', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        {
          provide: getRepositoryToken(RewardTransaction),
          useValue: mockRewardTransactionRepo,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepo,
        },
        {
          provide: StellarService,
          useValue: mockStellarService,
        },
        {
          provide: XlmPriceService,
          useValue: mockXlmPriceService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    const service = module.get<WalletService>(WalletService);

    mockUserRepo.findOne.mockResolvedValue({ id: 'u1', stellarWalletAddress: 'GABC' });
    mockStellarService.getAccountBalance.mockResolvedValue('5.00');
    mockRewardTransactionRepo.getRawOne.mockResolvedValueOnce({ total: '10.00' }).mockResolvedValueOnce({ total: '1.00' });

    const res = await service.reconcile('u1');
    expect(res.walletLinked).toBe(true);
    expect(res.liveBalance).toBe('5.00');
    expect(res.totalEarnedFromTasks).toBe('10.00');
  });
});
