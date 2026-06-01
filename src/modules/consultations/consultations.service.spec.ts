import { BadRequestException } from '@nestjs/common';
import { ConsultationsService } from './consultations.service';

describe('ConsultationsService', () => {
  let service: ConsultationsService;

  const makeRepo = () => ({
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
  });
  const mockConsultationRepo = makeRepo();
  const mockAvailabilityRepo = makeRepo();
  const mockQueueService = { addDelayedJob: jest.fn() } as any;

  beforeEach(() => {
    service = new ConsultationsService(
      mockConsultationRepo as any,
      mockAvailabilityRepo as any,
      mockQueueService,
    );
    jest.clearAllMocks();
  });

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

  it('creates an availability slot for a healer', async () => {
    const startTime = new Date('2026-06-15T09:00:00.000Z');
    const endTime = new Date('2026-06-15T10:00:00.000Z');
    const created = { id: 'slot-1', healerId: 'healer-1', startTime, endTime };

    mockAvailabilityRepo.create.mockReturnValue(created);
    mockAvailabilityRepo.save.mockResolvedValue(created);

    const result = await service.setAvailability('healer-1', startTime, endTime);

    expect(mockAvailabilityRepo.create).toHaveBeenCalledWith({
      healerId: 'healer-1',
      startTime,
      endTime,
    });
    expect(result).toEqual(created);
  });

  it('rejects availability when startTime is not before endTime', async () => {
    const time = new Date('2026-06-15T10:00:00.000Z');
    await expect(service.setAvailability('healer-1', time, time)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('marks booked slots as unavailable in the calendar', async () => {
    const healerId = 'healer-1';
    const startTime = new Date('2026-06-15T09:00:00.000Z');
    const endTime = new Date('2026-06-15T10:00:00.000Z');
    const slots = [{ id: 'slot-1', healerId, startTime, endTime }];
    const booked = [
      {
        id: 'c1',
        healerId,
        scheduledAt: new Date('2026-06-15T09:30:00.000Z'),
        cancelled: false,
      },
    ];

    mockAvailabilityRepo.find.mockResolvedValue(slots);
    mockConsultationRepo.find.mockResolvedValue(booked);

    const calendar = await service.getAvailability(healerId);

    expect(calendar).toHaveLength(1);
    expect(calendar[0].available).toBe(false);
  });

  it('marks slots as available when no booking overlaps', async () => {
    const healerId = 'healer-1';
    const startTime = new Date('2026-06-15T09:00:00.000Z');
    const endTime = new Date('2026-06-15T10:00:00.000Z');
    const slots = [{ id: 'slot-1', healerId, startTime, endTime }];

    mockAvailabilityRepo.find.mockResolvedValue(slots);
    mockConsultationRepo.find.mockResolvedValue([]);

    const calendar = await service.getAvailability(healerId);

    expect(calendar[0].available).toBe(true);
  });
});
