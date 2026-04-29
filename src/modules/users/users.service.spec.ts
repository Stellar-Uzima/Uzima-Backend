import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    password: '$2b$10$hashedpassword',
    firstName: 'John',
    lastName: 'Doe',
    role: 'user',
    companyId: 'company-123',
    isActive: true,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCompany = {
    id: 'company-123',
    name: 'Test Company',
    annualRetirementTarget: 1000,
    netZeroTarget: 5000,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrismaService = {
    user: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    company: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const createUserDto = {
      email: 'newuser@example.com',
      password: 'Password123!',
      firstName: 'New',
      lastName: 'User',
      companyId: 'company-123',
    };

    it('should create a new user successfully', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.company.findUnique.mockResolvedValue(mockCompany);
      mockPrismaService.user.create.mockResolvedValue({
        id: 'new-user-id',
        ...createUserDto,
        password: '$2b$10$hashed',
        role: 'user',
        isActive: true,
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create(createUserDto);

      expect(mockPrismaService.user.findFirst).toHaveBeenCalled();
      expect(mockPrismaService.user.create).toHaveBeenCalled();
      expect(result).toHaveProperty('id');
    });

    it('should throw ConflictException if email already exists', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);

      await expect(service.create(createUserDto)).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if company does not exist', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.company.findUnique.mockResolvedValue(null);

      await expect(service.create(createUserDto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return all users with pagination', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([mockUser]);
      mockPrismaService.user.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toEqual([mockUser]);
      expect(result.total).toBe(1);
    });

    it('should handle empty result set', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([]);
      mockPrismaService.user.count.mockResolvedValue(0);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('findOne', () => {
    it('should return a single user by id', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findOne('user-123');

      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const updateUserDto = { firstName: 'Updated', lastName: 'Name' };

    it('should update a user successfully', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue({ ...mockUser, ...updateUserDto });

      const result = await service.update('user-123', updateUserDto);

      expect(result.firstName).toBe('Updated');
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.update('non-existent', updateUserDto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete a user successfully', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.delete.mockResolvedValue(mockUser);

      const result = await service.remove('user-123');

      expect(result.id).toBe('user-123');
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.remove('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('Validation', () => {
    it('should validate email format', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(
        service.create({
          email: 'invalid-email',
          password: 'Password123!',
          firstName: 'Test',
          lastName: 'User',
          companyId: 'company-123',
        }),
      ).rejects.toThrow();
    });
  });

  describe('Queries', () => {
    it('should search users by name', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([mockUser]);
      mockPrismaService.user.count.mockResolvedValue(1);

      const result = await service.search('John');

      expect(result.data).toHaveLength(1);
    });

    it('should return empty array for no matches', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([]);
      mockPrismaService.user.count.mockResolvedValue(0);

      const result = await service.search('nonexistent');

      expect(result.data).toEqual([]);
    });
  });
});