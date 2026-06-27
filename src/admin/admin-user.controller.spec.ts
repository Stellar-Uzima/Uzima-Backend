import { Test, TestingModule } from '@nestjs/testing';
import { AdminUsersController } from './admin-user.controller';
import { AdminUsersService } from './services/admin-users.service';

jest.mock('@modules/auth/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class Mock {},
}));
jest.mock('@modules/auth/guards/roles.guard', () => ({ RolesGuard: class Mock {} }));

describe('AdminUsersController', () => {
  let controller: AdminUsersController;

  const mockAdminUsersService = {
    listUsers: jest.fn(),
    getUserById: jest.fn(),
    updateRole: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminUsersController],
      providers: [
        { provide: AdminUsersService, useValue: mockAdminUsersService },
      ],
    }).compile();

    controller = module.get<AdminUsersController>(AdminUsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
