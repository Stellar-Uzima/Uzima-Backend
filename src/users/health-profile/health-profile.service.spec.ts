import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { HealthProfileService } from './health-profile.service';
import { HealthProfile } from '../entities/health-profile.entity';

describe('HealthProfileService', () => {
  let service: HealthProfileService;

  const mockHealthProfileRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthProfileService,
        {
          provide: getRepositoryToken(HealthProfile),
          useValue: mockHealthProfileRepo,
        },
      ],
    }).compile();

    service = module.get(HealthProfileService);
  });

  describe('getCompletionScore', () => {
    it('returns 100 when all optional fields are filled', async () => {
      mockHealthProfileRepo.findOne.mockResolvedValue({
        healthGoals: ['Exercise'],
        chronicConditions: 'encrypted-value',
        preferredHealerType: 'BOTH',
        dailyTaskTarget: 5,
      });

      const result = await service.getCompletionScore('user-1');

      expect(result.score).toBe(100);
      expect(result.missingFields).toEqual([]);
    });

    it('returns missing fields and partial score', async () => {
      mockHealthProfileRepo.findOne.mockResolvedValue({
        healthGoals: [],
        chronicConditions: null,
        preferredHealerType: 'BOTH',
        dailyTaskTarget: 3,
      });

      const result = await service.getCompletionScore('user-1');

      expect(result.score).toBe(50);
      expect(result.missingFields).toEqual(
        expect.arrayContaining(['healthGoals', 'chronicConditions']),
      );
    });

    it('throws when profile is not found', async () => {
      mockHealthProfileRepo.findOne.mockResolvedValue(null);

      await expect(service.getCompletionScore('missing-user')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
