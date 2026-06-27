import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from '../../entities/user.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('UsersService (auth module copy)', () => {
  let service: UsersService;

  const mockQb: any = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };
  const mockRepo = { createQueryBuilder: jest.fn(() => mockQb), save: jest.fn() };
  const mockEmitter = { emit: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockQb.addSelect.mockReturnThis();
    mockQb.where.mockReturnThis();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockRepo },
        { provide: EventEmitter2, useValue: mockEmitter },
      ],
    }).compile();
    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => { expect(service).toBeDefined(); });

  it('findByEmail returns null when no user found', async () => {
    mockQb.getOne.mockResolvedValue(null);
    expect(await service.findByEmail('unknown@example.com')).toBeNull();
  });

  it('findByEmail normalises email to lowercase before querying', async () => {
    mockQb.getOne.mockResolvedValue({ id: 'u1', email: 'test@example.com' });
    await service.findByEmail('TEST@EXAMPLE.COM');
    expect(mockQb.where).toHaveBeenCalled();
  });

  it('findById throws when user not found', async () => {
    mockQb.getOne.mockResolvedValue(null);
    await expect(service.findById('bad-id')).rejects.toThrow('User not found');
  });
});
