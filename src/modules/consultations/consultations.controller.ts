import { Controller, Post, Body, HttpCode, HttpStatus, Delete, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConsultationsService } from './consultations.service';

class ScheduleDto {
  userId: string;
  scheduledAt: string;
}

@ApiTags('Consultations')
@Controller('consultations')
export class ConsultationsController {
  constructor(private readonly consultationsService: ConsultationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Schedule a consultation' })
  @ApiResponse({ status: 201, description: 'Consultation scheduled' })
  async schedule(@Body() body: ScheduleDto) {
    const scheduledAt = new Date(body.scheduledAt);
    const result = await this.consultationsService.schedule(body.userId, scheduledAt);
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
