import { Test, TestingModule } from '@nestjs/testing';
import { HealerController } from './healer.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

describe('HealerController', () => {
  let controller: HealerController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealerController],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();
    controller = module.get<HealerController>(HealerController);
  });

  it('should be defined', () => { expect(controller).toBeDefined(); });

  it('getDashboard returns welcome message for healer or admin', () => {
    expect(controller.getDashboard()).toEqual({ message: 'Welcome healer or admin' });
  });

  it('getAdmin returns admin-only message', () => {
    expect(controller.getAdmin()).toEqual({ message: 'Admin only endpoint' });
  });
});
