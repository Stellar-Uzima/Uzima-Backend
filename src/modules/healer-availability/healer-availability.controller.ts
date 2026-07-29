import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Req,
  UseGuards,
  ForbiddenException,
  NotFoundException,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { HealerAvailabilityService } from './healer-availability.service';
import { SetScheduleDto } from './dto/set-schedule.dto';
import { BookSlotDto, BlockDateDto } from './dto/book-slot.dto';
import { CancelBookingDto } from './dto/book-slot.dto';
import { DayOfWeek } from './entities/availability-slot.entity';

interface AuthenticatedRequest extends Request {
  user: { userId: string; role?: string };
}

@ApiTags('healer-availability')
@ApiBearerAuth()
@Controller('healer-availability')
export class HealerAvailabilityController {
  constructor(
    private readonly healerAvailabilityService: HealerAvailabilityService,
  ) {}

  @Post('schedule')
  @ApiOperation({ summary: 'Set weekly recurring availability schedule' })
  async setWeeklySchedule(
    @Body() dto: SetScheduleDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const healerId = req.user.userId;
    return this.healerAvailabilityService.setWeeklySchedule(
      healerId,
      dto.slots,
      dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
      dto.effectiveUntil ? new Date(dto.effectiveUntil) : undefined,
    );
  }

  @Post('block')
  @ApiOperation({ summary: 'Block a specific date' })
  async blockDate(
    @Body() dto: BlockDateDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const healerId = req.user.userId;
    return this.healerAvailabilityService.blockDate(healerId, dto);
  }

  @Get('slots/available')
  @ApiOperation({ summary: 'Get available slots for a healer within a date range' })
  async getAvailableSlots(
    @Query('healerId') healerId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    if (!healerId || !startDate || !endDate) {
      throw new BadRequestException('healerId, startDate, and endDate are required');
    }

    return this.healerAvailabilityService.getAvailableSlots(
      healerId,
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Post('book')
  @ApiOperation({ summary: 'Book a slot with a healer' })
  async bookSlot(@Body() dto: BookSlotDto, @Req() req: AuthenticatedRequest) {
    const userId = req.user.userId;

    const slotIdParts = dto.slotId.split('-');
    if (slotIdParts.length < 2) {
      throw new BadRequestException('Invalid slotId format. Expected: slotId-healerId');
    }
    const healerId = slotIdParts[1];

    return this.healerAvailabilityService.bookSlot(userId, healerId, dto);
  }

  @Post('appointments/:id/cancel')
  @ApiOperation({ summary: 'Cancel a booking' })
  async cancelBooking(
    @Param('id') id: string,
    @Body() dto: CancelBookingDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.userId;
    return this.healerAvailabilityService.cancelBooking(id, userId, dto);
  }

  @Get('appointments')
  @ApiOperation({ summary: 'Get my appointments' })
  async getMyAppointments(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const userId = req.user.userId;
    return this.healerAvailabilityService.getMyAppointments(
      userId,
      status,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }
}