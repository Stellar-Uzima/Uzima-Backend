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
    mockRepo.createQueryBuilder.mockImplementation(() => mockQb);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockRepo },
        { provide: EventEmitter2, useValue: mockEmitter },
      ],
    }).compile();
    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByEmail', () => {
    it('returns null when no user is found', async () => {
      mockQb.getOne.mockResolvedValue(null);
      await expect(service.findByEmail('unknown@example.com')).resolves.toBeNull();
    });

    it('returns the user record when one is found', async () => {
      const user = { id: 'u1', email: 'test@example.com' };
      mockQb.getOne.mockResolvedValue(user);
      await expect(service.findByEmail('test@example.com')).resolves.toEqual(user);
    });

    it('normalises email to lowercase before querying', async () => {
      mockQb.getOne.mockResolvedValue({ id: 'u1', email: 'test@example.com' });
      await service.findByEmail('TEST@EXAMPLE.COM');
      const bindings = mockQb.where.mock.calls.flatMap((c: any[]) => [c[0], c[1]]);
      expect(JSON.stringify(bindings)).toContain('test@example.com');
      expect(JSON.stringify(bindings)).not.toContain('TEST@EXAMPLE.COM');
    });

    it('propagates query failures to the caller', async () => {
      mockQb.getOne.mockRejectedValue(new Error('db connection lost'));
      await expect(service.findByEmail('test@example.com')).rejects.toThrow('db connection lost');
    });
  });

  describe('findById', () => {
    it('throws "User not found" when no user exists for the id', async () => {
      mockQb.getOne.mockResolvedValue(null);
      await expect(service.findById('bad-id')).rejects.toThrow('User not found');
    });

    it('returns the user when it exists', async () => {
      const user = { id: 'u1', email: 'test@example.com' };
      mockQb.getOne.mockResolvedValue(user);
      await expect(service.findById('u1')).resolves.toEqual(user);
    });

    it('propagates query failures instead of masking them as not found', async () => {
      mockQb.getOne.mockRejectedValue(new Error('db connection lost'));
      await expect(service.findById('u1')).rejects.toThrow('db connection lost');
    });
  });
});
