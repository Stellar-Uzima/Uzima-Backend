import {
  Controller,
  Get,
  Post,
  Patch,
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
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../modules/auth/guards/roles.guard';
import { Roles } from '../modules/auth/decorators/roles.decorator';
import { Role } from '../modules/auth/enums/role.enum';
import {
  RewardCatalogService,
  CreateRewardCatalogDto,
  UpdateRewardCatalogDto,
  RedeemRewardDto,
  CatalogAdminQueryDto,
  LowStockQueryDto,
} from './reward-catalog.service';
import { RewardCatalog } from './entities/reward-catalog.entity';

@ApiTags('Rewards Catalog')
@ApiBearerAuth()
@Controller()
export class RewardCatalogController {
  constructor(private readonly catalogService: RewardCatalogService) {}

  /** Resolves the authenticated actor, falling back to legacy `sub` claims. */
  private actor(req: any) {
    return {
      userId: req?.user?.userId ?? req?.user?.sub,
      userRole: req?.user?.role,
    };
  }

  // ========== Admin Endpoints ==========

  @Post('admin/reward-catalog')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '[ADMIN] Create a new reward catalog entry' })
  @ApiResponse({ status: 201, description: 'Reward created', type: RewardCatalog })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: requires ADMIN role' })
  async create(@Req() req: any, @Body() dto: CreateRewardCatalogDto): Promise<RewardCatalog> {
    return this.catalogService.create(dto, this.actor(req));
  }

  @Get('admin/reward-catalog')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Paginated catalog list including inactive and expired entries' })
  @ApiResponse({ status: 200, description: 'Paginated rewards; each row carries an isExpired flag' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: requires ADMIN role' })
  async findAll(@Query() query: CatalogAdminQueryDto) {
    return this.catalogService.findAll(query.status, query.type, query.page, query.limit);
  }

  @Get('admin/reward-catalog/low-stock')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Rewards whose stock is at or below the threshold' })
  @ApiResponse({ status: 200, description: 'Low-stock rewards (unlimited stock excluded)' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 403, description: 'Forbidden: requires ADMIN role' })
  async getLowStock(@Query() query: LowStockQueryDto) {
    return this.catalogService.getLowStock(query.threshold);
  }

  @Get('admin/reward-catalog/analytics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Get reward catalog analytics' })
  @ApiResponse({ status: 200, description: 'Analytics data' })
  @ApiResponse({ status: 403, description: 'Forbidden: requires ADMIN role' })
  async getAnalytics() {
    return this.catalogService.getAnalytics();
  }

  @Get('admin/reward-catalog/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Get reward by ID' })
  @ApiParam({ name: 'id', description: 'Reward UUID' })
  @ApiResponse({ status: 200, description: 'Reward details', type: RewardCatalog })
  @ApiResponse({ status: 404, description: 'Reward not found' })
  @ApiResponse({ status: 403, description: 'Forbidden: requires ADMIN role' })
  async findOne(@Param('id') id: string): Promise<RewardCatalog> {
    return this.catalogService.findOne(id);
  }

  @Patch('admin/reward-catalog/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Update a reward catalog entry' })
  @ApiParam({ name: 'id', description: 'Reward UUID' })
  @ApiResponse({ status: 200, description: 'Reward updated', type: RewardCatalog })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 404, description: 'Reward not found' })
  @ApiResponse({ status: 403, description: 'Forbidden: requires ADMIN role' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRewardCatalogDto,
    @Req() req: any,
  ): Promise<RewardCatalog> {
    return this.catalogService.update(id, dto, this.actor(req));
  }

  @Delete('admin/reward-catalog/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '[ADMIN] Archive a reward (soft delete; rows are never hard-deleted)' })
  @ApiParam({ name: 'id', description: 'Reward UUID' })
  @ApiResponse({ status: 204, description: 'Reward archived' })
  @ApiResponse({ status: 404, description: 'Reward not found' })
  @ApiResponse({ status: 403, description: 'Forbidden: requires ADMIN role' })
  async delete(@Param('id') id: string, @Req() req: any): Promise<void> {
    return this.catalogService.delete(id, this.actor(req));
  }

  // ========== Public / User Endpoints ==========

  @Get('rewards/catalog')
  @ApiOperation({ summary: 'Public catalog: active, non-expired rewards with stock levels' })
  @ApiResponse({ status: 200, description: 'Active rewards that have not expired', type: [RewardCatalog] })
  async getPublicCatalog(): Promise<RewardCatalog[]> {
    return this.catalogService.getPublicCatalog();
  }

  @Get('rewards/catalog/available')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get available rewards for redemption' })
  @ApiResponse({ status: 200, description: 'List of available rewards', type: [RewardCatalog] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getAvailableRewards(): Promise<RewardCatalog[]> {
    return this.catalogService.getAvailableRewards();
  }

  @Post('rewards/catalog/redeem')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Redeem a reward using wallet balance' })
  @ApiResponse({ status: 200, description: 'Reward redeemed successfully' })
  @ApiResponse({ status: 400, description: 'Insufficient balance, out of stock, or expired' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Reward not found' })
  async redeem(@Req() req: any, @Body() dto: RedeemRewardDto) {
    return this.catalogService.redeem(req.user.userId ?? req.user.sub, dto);
  }
}
