/// <reference types="jest" />
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HealerAvailabilityService } from './healer-availability.service';
import { AvailabilitySlot } from './entities/availability-slot.entity';
import { Appointment } from './entities/appointment.entity';
import { DayOfWeek } from './entities/availability-slot.entity';
import { BookSlotDto, CancelBookingDto, BlockDateDto } from './dto/book-slot.dto';

describe('HealerAvailabilityService', () => {
  let service: HealerAvailabilityService;
  let slotRepository: Repository<AvailabilitySlot>;
  let appointmentRepository: Repository<Appointment>;

  const mockSlotRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const mockAppointmentRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    })),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealerAvailabilityService,
        {
          provide: getRepositoryToken(AvailabilitySlot),
          useValue: mockSlotRepository,
        },
        {
          provide: getRepositoryToken(Appointment),
          useValue: mockAppointmentRepository,
        },
      ],
    }).compile();

    service = module.get<HealerAvailabilityService>(HealerAvailabilityService);
    slotRepository = module.get<Repository<AvailabilitySlot>>(
      getRepositoryToken(AvailabilitySlot),
    );
    appointmentRepository = module.get<Repository<Appointment>>(
      getRepositoryToken(Appointment),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('setWeeklySchedule', () => {
    it('should create new recurring slots when they do not exist', async () => {
      const healerId = 'healer-1';
      const slots = [{ dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '17:00' }];

      mockSlotRepository.find.mockResolvedValue([]);
      const mockSavedSlot = { id: 'slot-1', healerId, dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '17:00', isRecurring: true };
      mockSlotRepository.create.mockReturnValue(mockSavedSlot);
      mockSlotRepository.save.mockResolvedValue(mockSavedSlot);

      const result = await service.setWeeklySchedule(healerId, slots as any);

      expect(result).toHaveLength(1);
      expect(mockSlotRepository.save).toHaveBeenCalled();
    });

    it('should skip slots that already exist', async () => {
      const healerId = 'healer-1';
      const slots = [{ dayOfWeek: DayOfWeek.MONDAY, startTime: '09:00', endTime: '17:00' }];

      mockSlotRepository.find.mockResolvedValue([{ id: 'existing-slot' }]);

      const result = await service.setWeeklySchedule(healerId, slots as any);

      expect(result).toHaveLength(0);
    });
  });

  describe('blockDate', () => {
    it('should create a blocking slot for a date', async () => {
      const healerId = 'healer-1';
      const blockData: BlockDateDto = { date: '2025-01-06', reason: 'Holiday' };

      mockSlotRepository.findOne.mockResolvedValue(null);
      const mockBlockingSlot = { id: 'block-1', healerId, exceptionDate: new Date('2025-01-06'), isBlocked: true };
      mockSlotRepository.create.mockReturnValue(mockBlockingSlot);
      mockSlotRepository.save.mockResolvedValue(mockBlockingSlot);

      const result = await service.blockDate(healerId, blockData);

      expect(result).toEqual(mockBlockingSlot);
      expect(mockSlotRepository.save).toHaveBeenCalled();
    });

    it('should return existing block if already exists', async () => {
      const healerId = 'healer-1';
      const blockData: BlockDateDto = { date: '2025-01-06' };
      const existingBlock = { id: 'block-1', healerId, exceptionDate: new Date('2025-01-06'), isBlocked: true };

      mockSlotRepository.findOne.mockResolvedValue(existingBlock);

      const result = await service.blockDate(healerId, blockData);

      expect(result).toEqual(existingBlock);
    });
  });

  describe('bookSlot', () => {
    it('should create a new appointment for a valid booking', async () => {
      const userId = 'user-1';
      const healerId = 'healer-1';
      const dto = { slotId: 'slot-1', date: '2025-01-06', sendReminder: false } as BookSlotDto;

      const slot = { id: 'slot-1', healerId, startTime: '09:00', endTime: '10:00', isBlocked: false };
      mockSlotRepository.findOne.mockResolvedValue(slot);
      mockAppointmentRepository.findOne.mockResolvedValue(null);

      const savedAppointment = { id: 'apt-1', slotId: 'slot-1', userId, healerId, status: 'pending' };
      mockAppointmentRepository.create.mockReturnValue(savedAppointment);
      mockAppointmentRepository.save.mockResolvedValue(savedAppointment);

      const result = await service.bookSlot(userId, healerId, dto);

      expect(result).toEqual(savedAppointment);
      expect(mockAppointmentRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if slot does not exist', async () => {
      const userId = 'user-1';
      const healerId = 'healer-1';
      const dto = { slotId: 'slot-1', date: '2025-01-06' } as BookSlotDto;

      mockSlotRepository.findOne.mockResolvedValue(null);

      await expect(service.bookSlot(userId, healerId, dto)).rejects.toThrow('Availability slot not found');
    });

    it('should throw ConflictException if slot is already booked', async () => {
      const userId = 'user-1';
      const healerId = 'healer-1';
      const dto = { slotId: 'slot-1', date: '2025-01-06' } as BookSlotDto;

      const slot = { id: 'slot-1', healerId, startTime: '09:00', endTime: '10:00', isBlocked: false };
      mockSlotRepository.findOne.mockResolvedValue(slot);
      mockAppointmentRepository.findOne.mockResolvedValue({ id: 'existing-apt' });

      await expect(service.bookSlot(userId, healerId, dto)).rejects.toThrow('This slot is already booked');
    });
  });

  describe('cancelBooking', () => {
    it('should cancel a booking and set late flag appropriately', async () => {
      const userId = 'user-1';
      const bookingId = 'apt-1';
      const dto: CancelBookingDto = { reason: 'Personal reasons' };

      const appointment = {
        id: bookingId,
        userId,
        status: 'pending',
        scheduledAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      };
      mockAppointmentRepository.findOne.mockResolvedValue(appointment);
      mockAppointmentRepository.save.mockImplementation((entity: any) => Promise.resolve(entity));

      const result = await service.cancelBooking(bookingId, userId, dto);

      expect(result.status).toBe('cancelled');
      expect(result.cancellationReason).toBe('Personal reasons');
      expect(result.isLateCancellation).toBe(false);
    });
  });

  describe('getMyAppointments', () => {
    it('should return appointments for a user', async () => {
      const userId = 'user-1';
      const appointments = [{ id: 'apt-1', userId, status: 'pending' }];

      mockAppointmentRepository.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(appointments),
      });

      const result = await service.getMyAppointments(userId);

      expect(result).toEqual(appointments);
    });
  });
});