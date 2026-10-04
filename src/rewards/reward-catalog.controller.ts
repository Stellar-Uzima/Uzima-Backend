import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../modules/auth/guards/roles.guard';
import { Roles } from '../../modules/auth/decorators/roles.decorator';
import { Role } from '../../modules/auth/enums/role.enum';
import { RewardCatalogService, CreateRewardCatalogDto, UpdateRewardCatalogDto, RedeemRewardDto } from './reward-catalog.service';
import { RewardCatalog, RewardType, RewardCatalogStatus } from './entities/reward-catalog.entity';

@ApiTags('Rewards Catalog')
@ApiBearerAuth()
@Controller('rewards/catalog')
export class RewardCatalogController {
  constructor(private readonly catalogService: RewardCatalogService) {}

  // ========== Admin Endpoints ==========

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '[ADMIN] Create a new reward catalog entry' })
  @ApiResponse({ status: 201, description: 'Reward created', type: RewardCatalog })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 403, description: 'Forbidden: requires ADMIN role' })
  async create(@Body() dto: CreateRewardCatalogDto): Promise<RewardCatalog> {
    return this.catalogService.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPPORT)
  @ApiOperation({ summary: '[ADMIN/SUPPORT] List all rewards with filters' })
  @ApiQuery({ name: 'status', enum: RewardCatalogStatus, required: false })
  @ApiQuery({ name: 'type', enum: RewardType, required: false })
  @ApiQuery({ name: 'page', type: Number, required: false, example: 1 })
  @ApiQuery({ name: 'limit', type: Number, required: false, example: 20 })
  @ApiResponse({ status: 200, description: 'Rewards list' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async findAll(
    @Query('status') status?: RewardCatalogStatus,
    @Query('type') type?: RewardType,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.catalogService.findAll(status, type, page, limit);
  }

  @Get('analytics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Get reward catalog analytics' })
  @ApiResponse({ status: 200, description: 'Analytics data' })
  @ApiResponse({ status: 403, description: 'Forbidden: requires ADMIN role' })
  async getAnalytics() {
    return this.catalogService.getAnalytics();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPPORT)
  @ApiOperation({ summary: '[ADMIN/SUPPORT] Get reward by ID' })
  @ApiParam({ name: 'id', description: 'Reward UUID' })
  @ApiResponse({ status: 200, description: 'Reward details', type: RewardCatalog })
  @ApiResponse({ status: 404, description: 'Reward not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async findOne(@Param('id') id: string): Promise<RewardCatalog> {
    return this.catalogService.findOne(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Update a reward catalog entry' })
  @ApiParam({ name: 'id', description: 'Reward UUID' })
  @ApiResponse({ status: 200, description: 'Reward updated', type: RewardCatalog })
  @ApiResponse({ status: 404, description: 'Reward not found' })
  @ApiResponse({ status: 403, description: 'Forbidden: requires ADMIN role' })
  async update(@Param('id') id: string, @Body() dto: UpdateRewardCatalogDto): Promise<RewardCatalog> {
    return this.catalogService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '[ADMIN] Discontinue a reward (soft delete)' })
  @ApiParam({ name: 'id', description: 'Reward UUID' })
  @ApiResponse({ status: 204, description: 'Reward discontinued' })
  @ApiResponse({ status: 404, description: 'Reward not found' })
  @ApiResponse({ status: 403, description: 'Forbidden: requires ADMIN role' })
  async delete(@Param('id') id: string): Promise<void> {
    return this.catalogService.delete(id);
  }

  // ========== User Endpoints ==========

  @Get('available')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get available rewards for redemption' })
  @ApiResponse({ status: 200, description: 'List of available rewards', type: [RewardCatalog] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getAvailableRewards(): Promise<RewardCatalog[]> {
    return this.catalogService.getAvailableRewards();
  }

  @Post('redeem')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Redeem a reward using wallet balance' })
  @ApiResponse({ status: 200, description: 'Reward redeemed successfully' })
  @ApiResponse({ status: 400, description: 'Insufficient balance or reward unavailable' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Reward not found' })
  async redeem(@Req() req: any, @Body() dto: RedeemRewardDto) {
    return this.catalogService.redeem(req.user.sub, dto);
  }
}