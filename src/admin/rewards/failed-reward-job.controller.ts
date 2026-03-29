import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiSecurity,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '../../auth/enums/role.enum';
import { FailedRewardJobService } from './failed-reward-job.service';
import {
  ListFailedJobsDto,
  ListFailedJobsResponseDto,
  ReplayFailedJobResponseDto,
} from './dto/failed-reward-job.dto';

@ApiTags('Admin - Reward Management')
@ApiBearerAuth()
@ApiSecurity('bearer')
@Controller('admin/rewards')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class FailedRewardJobController {
  constructor(private readonly failedRewardJobService: FailedRewardJobService) {}

  @Get('failed')
  @ApiOperation({
    summary: 'List all failed reward jobs',
    description:
      'Returns a paginated list of reward jobs that failed after exhausting all retry attempts.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of failed jobs',
    type: ListFailedJobsResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires ADMIN role' })
  async listFailedJobs(
    @Query() query: ListFailedJobsDto,
  ): Promise<ListFailedJobsResponseDto> {
    return this.failedRewardJobService.listFailedJobs(query);
  }

  @Post('failed/:id/replay')
  @ApiOperation({
    summary: 'Replay a failed reward job',
    description:
      'Re-queues a specific failed job for processing. The job is removed from the failed jobs table and added back to the reward queue.',
  })
  @ApiResponse({
    status: 200,
    description: 'Failed job successfully re-queued',
    type: ReplayFailedJobResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires ADMIN role' })
  @ApiResponse({ status: 404, description: 'Failed job not found' })
  async replayFailedJob(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ReplayFailedJobResponseDto> {
    return this.failedRewardJobService.replayFailedJob(id);
  }
}
