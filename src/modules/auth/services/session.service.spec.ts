import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SessionService } from './session.service';
import { Session } from '../../../database/entities/session.entity';
import { UsersService } from '../../../auth/services/users.service';

describe('SessionService', () => {
  let service: SessionService;
  const mockRepo = { create: jest.fn(), save: jest.fn(), find: jest.fn(), findOne: jest.fn() };
  const mockUsers = { findById: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        { provide: getRepositoryToken(Session), useValue: mockRepo },
        { provide: UsersService, useValue: mockUsers },
      ],
    }).compile();
    service = module.get<SessionService>(SessionService);
  });

  it('should be defined', () => { expect(service).toBeDefined(); });

  it('createSession creates and persists a session', async () => {
    mockUsers.findById.mockResolvedValue({ id: 'u1' });
    mockRepo.create.mockReturnValue({ tokenId: 't1', isActive: true });
    mockRepo.save.mockResolvedValue({ id: 's1', tokenId: 't1' });
    const result = await service.createSession('u1', 't1', { device: 'web' });
    expect(mockRepo.save).toHaveBeenCalled();
    expect(result).toHaveProperty('id', 's1');
  });

  it('revokeSession sets isActive false and returns true', async () => {
    const session = { tokenId: 't1', isActive: true };
    mockRepo.findOne.mockResolvedValue(session);
    mockRepo.save.mockResolvedValue({ ...session, isActive: false });
    expect(await service.revokeSession('t1')).toBe(true);
    expect(session.isActive).toBe(false);
  });

  it('revokeSession returns false for unknown tokenId', async () => {
    mockRepo.findOne.mockResolvedValue(null);
    expect(await service.revokeSession('unknown')).toBe(false);
  });
});
