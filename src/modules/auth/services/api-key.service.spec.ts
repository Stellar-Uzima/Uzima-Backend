import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ApiKeyService } from './api-key.service';
import { ApiKey } from '../../../database/entities/api-key.entity';
import { NotFoundException } from '@nestjs/common';

describe('ApiKeyService (auth module)', () => {
  let service: ApiKeyService;
  const mockRepo = { create: jest.fn(), save: jest.fn(), findOne: jest.fn(), find: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyService,
        { provide: getRepositoryToken(ApiKey), useValue: mockRepo },
      ],
    }).compile();
    service = module.get<ApiKeyService>(ApiKeyService);
  });

  it('should be defined', () => { expect(service).toBeDefined(); });

  it('generateApiKey creates and saves a key with 64 hex chars', async () => {
    mockRepo.create.mockReturnValue({ key: 'abc', userId: 1, scopes: ['read'] });
    mockRepo.save.mockResolvedValue({ id: 1, key: 'abc' });
    const result = await service.generateApiKey(1, ['read']);
    expect(mockRepo.save).toHaveBeenCalled();
    expect(result).toHaveProperty('key');
  });

  it('validateApiKey returns null for unknown or revoked key', async () => {
    mockRepo.findOne.mockResolvedValue(null);
    expect(await service.validateApiKey('bad')).toBeNull();
  });

  it('revokeApiKey throws NotFoundException for unknown id', async () => {
    mockRepo.findOne.mockResolvedValue(null);
    await expect(service.revokeApiKey(99)).rejects.toThrow(NotFoundException);
  });

  it('getApiKeysByUser returns all keys for a user', async () => {
    mockRepo.find.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    expect(await service.getApiKeysByUser(1)).toHaveLength(2);
  });
});
