import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { ConsultationsService } from './consultations.service';
import { Consultation } from './entities/consultation.entity';
import { HealerAvailability } from './entities/availability.entity';
import { QueueService } from '../../shared/queue/queue.service';

const mockConsultationRepo = {
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
};

const mockAvailabilityRepo = {
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const mockQueueService = { addDelayedJob: jest.fn() };

describe('ConsultationsService', () => {
  let service: ConsultationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsultationsService,
        { provide: getRepositoryToken(Consultation), useValue: mockConsultationRepo },
        { provide: getRepositoryToken(HealerAvailability), useValue: mockAvailabilityRepo },
        { provide: QueueService, useValue: mockQueueService },
      ],
    }).compile();

    service = module.get<ConsultationsService>(ConsultationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('setAvailability', () => {
    it('creates and saves an availability slot', async () => {
      const healerId = 'healer-uuid-1';
      const start = new Date('2026-06-10T10:00:00Z');
      const end = new Date('2026-06-10T11:00:00Z');

      const created = { id: 'slot-1', healerId, startTime: start, endTime: end };
      mockAvailabilityRepo.create.mockReturnValue(created);
      mockAvailabilityRepo.save.mockResolvedValue(created);

      const res = await service.setAvailability(healerId, start, end);

      expect(mockAvailabilityRepo.create).toHaveBeenCalledWith({ healerId, startTime: start, endTime: end });
      expect(mockAvailabilityRepo.save).toHaveBeenCalledWith(created);
      expect(res).toEqual(created);
    });

    it('throws on invalid time range', async () => {
      await expect(
        service.setAvailability(
          'h',
          new Date('2026-06-10T12:00:00Z'),
          new Date('2026-06-10T11:00:00Z'),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getAvailability', () => {
    it('returns slots with available=false when a consultation is booked inside slot', async () => {
      const healerId = 'healer-uuid-2';
      const slot = {
        id: 's1',
        healerId,
        startTime: new Date('2026-06-11T09:00:00Z'),
        endTime: new Date('2026-06-11T10:00:00Z'),
      };
      const consultation = {
        id: 'c1',
        healerId,
        scheduledAt: new Date('2026-06-11T09:15:00Z'),
        cancelled: false,
      };

      mockAvailabilityRepo.find.mockResolvedValue([slot]);
      mockConsultationRepo.find.mockResolvedValue([consultation]);

      const res = await service.getAvailability(healerId);

      expect(res).toHaveLength(1);
      expect(res[0].available).toBe(false);
    });

    it('returns available=true when no matching consultations', async () => {
      const healerId = 'healer-uuid-3';
      const slot = {
        id: 's2',
        healerId,
        startTime: new Date('2026-06-12T09:00:00Z'),
        endTime: new Date('2026-06-12T10:00:00Z'),
      };

      mockAvailabilityRepo.find.mockResolvedValue([slot]);
      mockConsultationRepo.find.mockResolvedValue([]);

      const res = await service.getAvailability(healerId);

      expect(res[0].available).toBe(true);
    });
  });

  describe('schedule and cancel', () => {
    it('schedules a consultation and enqueues a reminder job', async () => {
      const userId = 'user-1';
      const scheduledAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const created = { id: 'c1', userId, scheduledAt, healerId: null };

      mockConsultationRepo.create.mockReturnValue(created);
      mockConsultationRepo.save.mockResolvedValue(created);

      const result = await service.schedule(userId, scheduledAt);

      expect(mockConsultationRepo.create).toHaveBeenCalledWith({
        userId,
        scheduledAt,
        healerId: null,
      });
      expect(mockConsultationRepo.save).toHaveBeenCalledWith(created);
      expect(mockQueueService.addDelayedJob).toHaveBeenCalledTimes(1);
      expect(result).toEqual(created);
    });

    it('cancels a consultation', async () => {
      const consultation = { id: 'c1', cancelled: false };
      mockConsultationRepo.findOne.mockResolvedValue(consultation);
      mockConsultationRepo.save.mockResolvedValue({ ...consultation, cancelled: true });

      const res = await service.cancel('c1');

      expect(mockConsultationRepo.findOne).toHaveBeenCalledWith({ where: { id: 'c1' } });
      expect(res.cancelled).toBe(true);
    });
  });
});
