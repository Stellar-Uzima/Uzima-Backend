import { Test, TestingModule } from '@nestjs/testing';
import { StellarController } from './stellar.controller';
import { StellarService } from './stellar.service';

describe('StellarController', () => {
  let controller: StellarController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StellarController],
      providers: [StellarService],
    }).compile();

    controller = module.get<StellarController>(StellarController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
