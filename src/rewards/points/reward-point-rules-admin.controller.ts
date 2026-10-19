import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../modules/auth/guards/roles.guard';
import { Roles } from '../../modules/auth/decorators/roles.decorator';
import { Role } from '../../modules/auth/enums/role.enum';
import { RewardPointRule } from './entities/reward-point-rule.entity';
import { CreateRewardPointRuleDto } from './dto/create-reward-point-rule.dto';
import { UpdateRewardPointRuleDto } from './dto/update-reward-point-rule.dto';
import { RewardPointsService } from './reward-points.service';

@ApiTags('Admin - Reward Point Rules')
@ApiBearerAuth()
@Controller('admin/reward-point-rules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class RewardPointRulesAdminController {
  constructor(private readonly rewardPointsService: RewardPointsService) {}

  @Get()
  @ApiOperation({ summary: '[ADMIN] List all reward point rules' })
  @ApiResponse({ status: 200, description: 'All point rules', type: [RewardPointRule] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires ADMIN role' })
  async list(): Promise<RewardPointRule[]> {
    return this.rewardPointsService.listRules();
  }

  @Get(':id')
  @ApiOperation({ summary: '[ADMIN] Get a reward point rule by id' })
  @ApiParam({ name: 'id', description: 'Rule UUID' })
  @ApiResponse({ status: 200, description: 'Point rule', type: RewardPointRule })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires ADMIN role' })
  @ApiResponse({ status: 404, description: 'Rule not found' })
  async getOne(@Param('id', ParseUUIDPipe) id: string): Promise<RewardPointRule> {
    return this.rewardPointsService.getRule(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '[ADMIN] Create a reward point rule' })
  @ApiResponse({ status: 201, description: 'Rule created', type: RewardPointRule })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires ADMIN role' })
  @ApiResponse({ status: 409, description: 'Rule for this action already exists' })
  async create(@Body() dto: CreateRewardPointRuleDto): Promise<RewardPointRule> {
    return this.rewardPointsService.createRule(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '[ADMIN] Update a reward point rule' })
  @ApiParam({ name: 'id', description: 'Rule UUID' })
  @ApiResponse({ status: 200, description: 'Rule updated', type: RewardPointRule })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires ADMIN role' })
  @ApiResponse({ status: 404, description: 'Rule not found' })
  @ApiResponse({ status: 409, description: 'Rule for this action already exists' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRewardPointRuleDto,
  ): Promise<RewardPointRule> {
    return this.rewardPointsService.updateRule(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '[ADMIN] Delete a reward point rule' })
  @ApiParam({ name: 'id', description: 'Rule UUID' })
  @ApiResponse({ status: 204, description: 'Rule deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires ADMIN role' })
  @ApiResponse({ status: 404, description: 'Rule not found' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.rewardPointsService.deleteRule(id);
  }
}
