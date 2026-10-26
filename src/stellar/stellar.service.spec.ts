import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StellarService } from './stellar.service';
import { StellarResilienceService } from './stellar-resilience.service';

const mockServer = {
  accounts: jest.fn().mockReturnValue({
    accountId: jest.fn().mockReturnValue({
      call: jest.fn().mockResolvedValue({}),
    }),
  }),
};

jest.mock('stellar-sdk', () => ({
  __esModule: true,
  default: {
    Horizon: {
      Server: jest.fn().mockImplementation(() => mockServer),
    },
    Keypair: {},
  },
}));

describe('StellarService', () => {
  let service: StellarService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarService,
        {
          provide: StellarResilienceService,
          useValue: { execute: jest.fn(), withTimeout: jest.fn() },
        },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get<StellarService>(StellarService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
