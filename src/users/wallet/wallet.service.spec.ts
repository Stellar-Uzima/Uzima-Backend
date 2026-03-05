import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Cache } from 'cache-manager';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { WalletService } from './wallet.service';
import { RewardTransaction } from '../../rewards/entities/reward-transaction.entity';
import { User } from '../../entities/user.entity';
import { StellarService } from '../../stellar/stellar.service';
import { XlmPriceService } from '../../stellar/xlm-price.service';
import { RewardStatus } from '../../rewards/enums/reward-status.enum';

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

const mockCacheManager = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
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

describe('WalletService', () => {
  let service: WalletService;

  beforeEach(async () => {
    jest.clearAllMocks();
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
          provide: 'CACHE_MANAGER',
          useValue: mockCacheManager,
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

    service = module.get<WalletService>(WalletService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getWalletSummary', () => {
    it('should return cached summary if available', async () => {
      const cachedSummary = { walletLinked: true, liveBalance: '10.00' };
      mockCacheManager.get.mockResolvedValue(cachedSummary);

      const result = await service.getWalletSummary('user-id');

      expect(mockCacheManager.get).toHaveBeenCalledWith('wallet_summary:user-id');
      expect(result).toEqual(cachedSummary);
    });

    it('should return walletLinked false if no wallet address', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockUserRepo.findOne.mockResolvedValue({ id: 'user-id', walletAddress: null });

      const result = await service.getWalletSummary('user-id');

      expect(result).toEqual({ walletLinked: false });
    });

    it('should return full summary for user with wallet', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockUserRepo.findOne.mockResolvedValue({
        id: 'user-id',
        walletAddress: 'GABCDE...',
      });
      mockStellarService.getAccountBalance.mockResolvedValue('12.50');
      mockXlmPriceService.getXlmUsdRate.mockResolvedValue(0.12);

      // Mock earned from tasks
      mockRewardTransactionRepo.getRawOne
        .mockResolvedValueOnce({ total: '18.00' }) // earned
        .mockResolvedValueOnce({ total: '2.50' }); // pending

      const result = await service.getWalletSummary('user-id');

      expect(result).toEqual({
        walletAddress: 'GABCDE...',
        liveBalance: '12.50',
        totalEarnedFromTasks: '18.00',
        totalSpentOnConsultations: '0.00',
        pendingRewards: '2.50',
        xlmUsdRate: 0.12,
        balanceUsd: '1.50',
        walletLinked: true,
      });
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'wallet_summary:user-id',
        expect.any(Object),
        180000,
      );
    });

    it('should handle stellar service error gracefully', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockUserRepo.findOne.mockResolvedValue({
        id: 'user-id',
        walletAddress: 'GABCDE...',
      });
      mockStellarService.getAccountBalance.mockRejectedValue(new Error('Network error'));
      mockXlmPriceService.getXlmUsdRate.mockResolvedValue(0.12);
      mockRewardTransactionRepo.getRawOne
        .mockResolvedValueOnce({ total: null })
        .mockResolvedValueOnce({ total: null });

      const result = await service.getWalletSummary('user-id');

      expect(result.liveBalance).toBe('unavailable');
      expect(result.balanceUsd).toBe('0.00');
    });
  });

  describe('invalidateCache', () => {
    it('should delete cache on reward.earned event', async () => {
      await service.invalidateCache({ userId: 'user-id' });

      expect(mockCacheManager.del).toHaveBeenCalledWith('wallet_summary:user-id');
    });
  });
});