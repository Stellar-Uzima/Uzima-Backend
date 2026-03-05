import { Test, TestingModule } from '@nestjs/testing';
import { StellarService } from './stellar.service';

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
      providers: [StellarService],
    }).compile();

    service = module.get<StellarService>(StellarService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
