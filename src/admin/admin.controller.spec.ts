import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

jest.mock('../auth/guards/jwt-auth.guard', () => ({ JwtAuthGuard: class Mock {} }));
jest.mock('../auth/guards/roles.guard', () => ({ RolesGuard: class Mock {} }));

describe('AdminController', () => {
  let controller: AdminController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [AdminService],
    }).compile();

    controller = module.get<AdminController>(AdminController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
