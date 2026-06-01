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
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { UserSearchService } from './services/user-search.service';
import { UserSearchDto } from './dto/user-search.dto';
import { ActivityFeedQueryDto } from './dto/activity-feed-query.dto';
import { ActivityFeedService } from './services/activity-feed.service';
import { UpdateProfileDto, ProfileResponseDto } from '../../common/dtos/update-profile.dto';

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
@UseGuards(JwtAuthGuard)
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly userSearchService: UserSearchService,
    private readonly activityFeedService: ActivityFeedService,
  ) {}

  @Get('profile')
  async getCurrentProfile(
    @Req() req: AuthenticatedRequest,
  ): Promise<ProfileResponseDto> {
    const userId = this.extractUserId(req);
    return this.usersService.getProfile(userId);
  }

  @Put('profile')
  @HttpCode(200)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  async updateProfile(
    @Body() updateProfileDto: UpdateProfileDto,
    @Req() req: AuthenticatedRequest,
    userAgent?: string,
  ): Promise<ProfileResponseDto> {
    const authenticatedUserId = this.extractUserId(req);
    const ipAddress = this.extractIpAddress(req);
    const finalUserAgent = userAgent ?? (req.headers?.['user-agent'] as string | undefined);
    return this.usersService.updateProfile(
      authenticatedUserId,
      updateProfileDto,
      ipAddress,
      finalUserAgent,
    );
  }

  @Post('deactivate')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivate(@Req() req: AuthenticatedRequest): Promise<void> {
    const userId = this.extractUserId(req);
    await this.usersService.deactivateUser(userId);
  @Get('activity-feed')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  async getActivityFeed(
    @Query() query: ActivityFeedQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = this.extractUserId(req);
    return this.activityFeedService.getActivityFeed(
      userId,
      query.page,
      query.limit,
    );
  }

  @Get()
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  async findAll(
    @Query() searchDto: UserSearchDto,
    @Req() req?: AuthenticatedRequest,
  ) {
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
  async remove(@Param('id') id: string) {
    return { deleted: id };
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

    @Patch('profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @Req() req,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(
      req.user.id,
      dto,
    );
  }
}
