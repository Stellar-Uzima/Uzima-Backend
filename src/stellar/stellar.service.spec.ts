import { Test, TestingModule } from '@nestjs/testing';
import { StellarService } from './stellar.service';

jest.mock('stellar-sdk', () => ({
  __esModule: true,
  default: {
    Server: jest.fn().mockImplementation(() => ({
      accounts: () => ({ accountId: () => ({ call: jest.fn() }) }),
    })),
    Keypair: {},
  },
}));

describe('StellarService', () => {
  let service: StellarService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StellarService],
    }).compile();

    service = module.get<StellarService>(StellarService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
