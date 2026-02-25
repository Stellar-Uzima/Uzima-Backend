import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './services/auth.service';
import { UsersService } from './services/users.service';

jest.mock('redis', () => ({
  createClient: () => ({ connect: jest.fn() }),
}));

describe('AuthService', () => {
  let service: AuthService;

  const mockUsersService = { findByEmail: jest.fn(), create: jest.fn() };
  const mockJwtService = { sign: jest.fn() };
  const mockEventEmitter = { emit: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
