import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Req,
  Query,
  Patch,
  UseGuards,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Version,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@modules/auth/decorators/roles.decorator';
import { Role } from '@modules/auth/enums/role.enum';
import { UsersService } from './users.service';
import { UserSearchService } from './services/user-search.service';
import { UserSearchDto } from './dto/user-search.dto';
import { ActivityFeedQueryDto } from './dto/activity-feed-query.dto';
import { ActivityFeedService } from './services/activity-feed.service';
import { UserTimelineService } from './services/user-timeline.service';
import { UserTimelineQueryDto } from './dto/user-timeline.dto';
import { QueueService } from '../../shared/queue/queue.service';
import { DATA_PROCESSING_QUEUE, DATA_EXPORT_JOB } from '../../queue/queue.constants';
import { UpdateProfileDto, ProfileResponseDto } from '../../common/dto/update-profile.dto';
import { DataExportService, DataExportRequester } from './services/data-export.service';
import { Role } from '@modules/auth/enums/role.enum';
import { IsString, IsNotEmpty } from 'class-validator';

export class RegisterDeviceTokenDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}

type AuthenticatedRequest = {
  user?: {
    id?: string;
    sub?: string;
    userId?: string;
    email?: string;
    role?: string;
  } | null;
  headers?: {
    [key: string]: any;
  };
  ip?: string;
  connection?: {
    remoteAddress?: string;
  };
  socket?: {
    remoteAddress?: string;
  };
};

@ApiTags('users')
@ApiBearerAuth()
@Version('1')
@Controller({ path: 'users' })
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly userSearchService: UserSearchService,
    private readonly dataExportService: DataExportService,
    private readonly activityFeedService: ActivityFeedService,
    private readonly userTimelineService: UserTimelineService,
    private readonly queueService: QueueService
    private readonly activityFeedService: ActivityFeedService
  ) {}

  @Post('device-token')
  @HttpCode(200)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    })
  )
  async registerDeviceToken(
    @Body() registerDeviceTokenDto: RegisterDeviceTokenDto,
    @Req() req: AuthenticatedRequest
  ) {
    const userId = this.extractUserId(req);
    await this.usersService.registerDeviceToken(userId, registerDeviceTokenDto.token);
    return { success: true, message: 'Device token registered successfully' };
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({
    status: 200,
    description: 'Profile retrieved successfully',
    type: ProfileResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getCurrentProfile(@Req() req: AuthenticatedRequest): Promise<ProfileResponseDto> {
    const userId = this.extractUserId(req);
    return this.usersService.getProfile(userId);
  }

  @Put('profile')
  @HttpCode(200)
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  )
  async updateProfile(
    @Body() updateProfileDto: UpdateProfileDto,
    @Req() req: AuthenticatedRequest,
    userAgent?: string
  ): Promise<ProfileResponseDto> {
    const authenticatedUserId = this.extractUserId(req);
    const ipAddress = this.extractIpAddress(req);
    const finalUserAgent = userAgent ?? (req.headers?.['user-agent'] as string | undefined);
    return this.usersService.updateProfile(
      authenticatedUserId,
      updateProfileDto,
      ipAddress,
      finalUserAgent
    );
  }

  @Get('activity-feed')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  )
  async getActivityFeed(@Query() query: ActivityFeedQueryDto, @Req() req: AuthenticatedRequest) {
    const userId = this.extractUserId(req);
    return this.activityFeedService.getActivityFeed(userId, query.page, query.limit);
  }

  @Get('timeline')
  @ApiOperation({ summary: 'Get authenticated user activity timeline' })
  @ApiResponse({ status: 200, description: 'Timeline retrieved successfully' })
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  )
  async getMyTimeline(@Query() query: UserTimelineQueryDto, @Req() req: AuthenticatedRequest) {
    const userId = this.extractUserId(req);
    return this.userTimelineService.getTimeline(userId, query);
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: '[ADMIN] Get any user activity timeline by id' })
  @ApiParam({ name: 'id', description: 'Target user UUID' })
  @ApiResponse({ status: 200, description: 'Timeline retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden: requires ADMIN role' })
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  )
  async getUserTimeline(@Param('id') id: string, @Query() query: UserTimelineQueryDto) {
    if (!id) {
      throw new NotFoundException('User not found');
    }
    return this.userTimelineService.getTimeline(id, query);
  }

  @Get()
  @ApiOperation({ summary: 'Search and list users' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  )
  async findAll(@Query() searchDto: UserSearchDto, @Req() req?: AuthenticatedRequest) {
    const result = await this.userSearchService.searchUsers(searchDto);
    return {
      data: result.results,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      query: result.query,
      executionTimeMs: result.executionTimeMs,
      fuzzyUsed: result.fuzzyUsed,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User found' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOne(@Param('id') id: string) {
    if (!id) {
      throw new NotFoundException('User not found');
    }
    return { id };
  }

  @Post()
  async create(@Body() body: any) {
    if (!body) {
      throw new BadRequestException('Invalid request body');
    }
    return body;
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any) {
    return { id, ...body };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete user by ID' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User deleted' })
  async remove(@Param('id') id: string) {
    return { deleted: id };
  }

  @Post('deactivate')
  @HttpCode(200)
  async deactivateUser(@Req() req: AuthenticatedRequest): Promise<{ message: string }> {
    const userId = this.extractUserId(req);
    await this.usersService.deactivateUser(userId);
    return { message: 'Account successfully deactivated' };
  }

  @Post('data-export')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Request a GDPR/data export for the authenticated user',
    description:
      'Queues a personal data export. Exports are authorized only for the ' +
      'requesting user, admin accounts, or service accounts with the exports:read scope.',
  })
  @ApiResponse({ status: 202, description: 'Export job queued' })
  @ApiResponse({ status: 403, description: 'Not authorized to request export' })
  async requestDataExport(@Req() req: AuthenticatedRequest) {
    const userId = this.extractUserId(req);
    await this.queueService.addJob(
      DATA_PROCESSING_QUEUE,
      DATA_EXPORT_JOB,
      { userId },
      { maxRetries: 3 }
    );
    const ipAddress = this.extractIpAddress(req);
    const userAgent = req.headers?.['user-agent'] as string | undefined;
    const requestId = req.headers?.['x-request-id'] as string | undefined;

    const requester: DataExportRequester = {
      kind: (req as any).apiKey ? 'service' : 'user',
      userId,
      role: req.user?.role as Role | undefined,
      scopes: (req as any).apiKey?.scopes as string[] | undefined,
      ipAddress,
      userAgent,
      requestId,
    };

    return this.dataExportService.queueExport(userId, requester);
  }

  private extractUserId(req: AuthenticatedRequest): string {
    const userId = req.user?.id ?? req.user?.sub ?? req.user?.userId;
    if (!userId) {
      throw new ForbiddenException('Authenticated user context is missing');
    }
    return userId;
  }

  private extractIpAddress(req: AuthenticatedRequest): string | undefined {
    return req.ip || req.headers?.['x-forwarded-for']?.toString()?.split(',')[0]?.trim();
  }
}
