import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Delete,
  Param,
  Get,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { ConsultationsService } from './consultations.service';
import { SetAvailabilityDto } from './dto/set-availability.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '../../auth/enums/role.enum';

class ScheduleDto {
  userId: string;
  scheduledAt: string;
  healerId?: string;
}

@ApiTags('Consultations')
@Controller('consultations')
export class ConsultationsController {
  constructor(private readonly consultationsService: ConsultationsService) {}

  @Get('availability/:healerId')
  @ApiOperation({ summary: 'View healer availability calendar' })
  @ApiParam({ name: 'healerId', description: 'Healer user ID' })
  @ApiResponse({ status: 200, description: 'Availability slots with booked status' })
  async getAvailability(@Param('healerId') healerId: string) {
    return this.consultationsService.getAvailability(healerId);
  }

  @Post('availability')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HEALER, Role.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Set healer availability slot' })
  @ApiResponse({ status: 201, description: 'Availability slot created' })
  @ApiResponse({ status: 403, description: 'Healer role required' })
  async setAvailability(@Request() req: { user: { sub: string } }, @Body() body: SetAvailabilityDto) {
    const startTime = new Date(body.startTime);
    const endTime = new Date(body.endTime);
    return this.consultationsService.setAvailability(req.user.sub, startTime, endTime);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Schedule a consultation' })
  @ApiResponse({ status: 201, description: 'Consultation scheduled' })
  async schedule(@Body() body: ScheduleDto) {
    const scheduledAt = new Date(body.scheduledAt);
    const result = await this.consultationsService.schedule(
      body.userId,
      scheduledAt,
      body.healerId,
    );
    return result;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a consultation' })
  @ApiResponse({ status: 200, description: 'Consultation cancelled' })
  async cancel(@Param('id') id: string) {
    return this.consultationsService.cancel(id);
  }
}
