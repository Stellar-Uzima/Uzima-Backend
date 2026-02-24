import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RewardService } from './reward.service';
import { 
  RewardHistoryQueryDto, 
  RewardHistoryResponseDto,
  RewardHistoryItemDto 
} from './dto/reward-history.dto';

@ApiTags('rewards')
@Controller('rewards')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RewardController {
  constructor(private readonly rewardService: RewardService) {}

  @Get('history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Get user reward history',
    description: 'Retrieve paginated list of XLM rewards earned from health tasks with optional filtering'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Reward history retrieved successfully',
    type: RewardHistoryResponseDto
  })
  @ApiResponse({ 
    status: 401, 
    description: 'Unauthorized' 
  })
  async getRewardHistory(
    @Request() req: any,
    @Query() queryDto: RewardHistoryQueryDto,
  ): Promise<RewardHistoryResponseDto> {
    const userId = req.user.id;
    return this.rewardService.getRewardHistory(userId, queryDto);
  }
}
