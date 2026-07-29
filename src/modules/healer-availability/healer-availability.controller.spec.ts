import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { HealerAvailabilityController } from './healer-availability.controller';
import { HealerAvailabilityService } from './healer-availability.service';
import { SetScheduleDto } from './dto/set-schedule.dto';
import { BookSlotDto, BlockDateDto, CancelBookingDto } from './dto/book-slot.dto';

describe('HealerAvailabilityController', () => {
  let controller: HealerAvailabilityController;
  let service: HealerAvailabilityService;

  const mockService = {
    setWeeklySchedule: jest.fn(),
    blockDate: jest.fn(),
    getAvailableSlots: jest.fn(),
    bookSlot: jest.fn(),
    cancelBooking: jest.fn(),
    getMyAppointments: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealerAvailabilityController],
      providers: [
        {
          provide: HealerAvailabilityService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<HealerAvailabilityController>(HealerAvailabilityController);
    service = module.get<HealerAvailabilityService>(HealerAvailabilityService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});