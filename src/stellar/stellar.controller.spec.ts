import { Test, TestingModule } from '@nestjs/testing';
import { StellarController } from './stellar.controller';
import { StellarService } from './stellar.service';
import { XlmPriceService } from './xlm-price.service';

describe('StellarController', () => {
  let controller: StellarController;

  const mockStellarService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getAccountBalance: jest.fn(),
  };

  const mockXlmPriceService = {
    getXlmUsdRate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StellarController],
      providers: [
        { provide: StellarService, useValue: mockStellarService },
        { provide: XlmPriceService, useValue: mockXlmPriceService },
      ],
    }).compile();

    controller = module.get<StellarController>(StellarController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate getWalletBalance to the service', async () => {
    mockStellarService.getAccountBalance.mockResolvedValue('500.0000000');
    const result = await controller.getWalletBalance('GABCDEF...');
    expect(result).toEqual('500.0000000');
    expect(mockStellarService.getAccountBalance).toHaveBeenCalledWith('GABCDEF...');
  });
});