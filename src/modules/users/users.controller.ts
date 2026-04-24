import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  ForbiddenException,
  NotFoundException,
  HttpCode,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { AvatarService } from './services/avatar.service';
import { UserResponseDto } from '../../../users/dto/user-response.dto';
import { plainToInstance } from 'class-transformer';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../../entities/user.entity';

// Minimal Auth types & guard (copied from canonical controller)
interface AuthenticatedRequest extends Request {
  user: { userId: string; role?: string };
}
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
class JwtAuthGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    request.user = { userId: 'mock-user-id' }; // mock - replace with real JWT in prod
    return true;
  }
}

@ApiTags('users')
@UseGuards(JwtAuthGuard)
@Controller('users')
@UseGuards(RolesGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly userSearchService: UserSearchService,
    private readonly avatarService: AvatarService
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List all users (Admin only)',
    description:
      'Retrieve a paginated list of users with filtering and sorting options. Requires admin role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Users retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { $ref: '#/components/schemas/User' },
        },
        meta: {
          type: 'object',
          properties: {
            page: { type: 'number' },
            limit: { type: 'number' },
            total: { type: 'number' },
            totalPages: { type: 'number' },
            hasNext: { type: 'boolean' },
            hasPrev: { type: 'boolean' },
            nextPage: { type: 'number', nullable: true },
            prevPage: { type: 'number', nullable: true },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @Roles(Role.ADMIN)
  async findAll(
    @Query() filterDto: UserFilterDto,
    @Request() req: any
  ): Promise<PaginatedResponseDto<User>> {
    // Verify admin role (double check in addition to guard)
    const currentUser = req.user;
    if (currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }

    return this.usersService.listUsers(filterDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  async findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isOwner = req.user.userId === id;
    const isAdmin = req.user.role === 'ADMIN';

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Forbidden');
    }

    // Return sanitized response
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Update user profile (Admin only)',
    description: "Update a user's profile information. Requires admin role.",
  })
  @ApiResponse({
    status: 200,
    description: 'User updated successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @Roles(Role.ADMIN)
  async update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    // Verify admin role
    const currentUser = req.user;
    if (currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }

    // TODO: Implement update user logic
    return { message: 'Update user logic to be implemented', userId: id };
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete user account (Admin only)',
    description: 'Delete a user account. Requires admin role.',
  })
  @ApiResponse({
    status: 200,
    description: 'User deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @Roles(Role.ADMIN)
  async delete(@Param('id') id: string, @Request() req: any) {
    // Verify admin role
    const currentUser = req.user;
    if (currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }

    // TODO: Implement delete user logic
    return { message: 'Delete user logic to be implemented', userId: id };
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Change user status (Admin only)',
    description:
      "Change a user's status (active, inactive, suspended). Requires admin role. All status changes are logged.",
  })
  @ApiResponse({
    status: 200,
    description: 'User status changed successfully',
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        previousStatus: { type: 'string', enum: ['active', 'inactive', 'suspended'] },
        newStatus: { type: 'string', enum: ['active', 'inactive', 'suspended'] },
        changedAt: { type: 'string', format: 'date-time' },
        changedBy: { type: 'string' },
        changedByRole: { type: 'string', enum: ['USER', 'HEALER', 'ADMIN'] },
        reason: { type: 'string', nullable: true },
        notes: { type: 'string', nullable: true },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required or cannot change status of other admins',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid status or no change needed',
  })
  @Roles(Role.ADMIN)
  async changeUserStatus(
    @Param('id') id: string,
    @Body() statusChangeDto: UserStatusChangeDto,
    @Request() req: any,
    @Headers('user-agent') userAgent?: string
  ): Promise<UserStatusResponseDto> {
    // Verify admin role (double check in addition to guard)
    const currentUser = req.user;
    if (currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }

    // Get IP address from request
    const ipAddress = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;

    return this.usersService.changeUserStatus(
      id,
      statusChangeDto,
      currentUser.id,
      ipAddress,
      userAgent
    );
  }

  @Get(':id/status-history')
  @ApiOperation({
    summary: 'Get user status change history (Admin only)',
    description: 'Retrieve the history of status changes for a specific user. Requires admin role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Status history retrieved successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @Roles(Role.ADMIN)
  async getUserStatusHistory(
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Request() req: any
  ): Promise<PaginatedResponseDto<UserStatusLog>> {
    // Verify admin role
    const currentUser = req.user;
    if (currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }

    return this.usersService.getUserStatusHistory(id, page || 1, limit || 20);
  }

  @Get(':id/profile')
  @ApiOperation({
    summary: 'Get user profile with stats (Admin only)',
    description: "Retrieve a user's profile including statistics. Requires admin role.",
  })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @Roles(Role.ADMIN)
  async getProfile(@Param('id') id: string, @Request() req: any) {
    // Verify admin role
    const currentUser = req.user;
    if (currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }

    return this.usersService.getUserStats(id);
  }

  @Put('profile')
  @ApiOperation({
    summary: 'Update user profile',
    description:
      "Update the authenticated user's profile information. Users can update their own profile.",
  })
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        email: { type: 'string' },
        firstName: { type: 'string', nullable: true },
        lastName: { type: 'string', nullable: true },
        fullName: { type: 'string', nullable: true },
        phoneNumber: { type: 'string', nullable: true },
        avatar: { type: 'string', nullable: true },
        bio: { type: 'string', nullable: true },
        preferredLanguage: { type: 'string', nullable: true },
        country: { type: 'string', nullable: true },
        role: { type: 'string', enum: ['USER', 'HEALER', 'ADMIN'] },
        status: { type: 'string', enum: ['active', 'inactive', 'suspended'] },
        isVerified: { type: 'boolean' },
        lastActiveAt: { type: 'string', format: 'date-time', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid input data',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async updateProfile(
    @Body() updateProfileDto: UpdateProfileDto,
    @Request() req: any,
    @Headers('user-agent') userAgent?: string
  ): Promise<ProfileResponseDto> {
    // Get the authenticated user's ID
    const userId = req.user.sub;
    if (!userId) {
      throw new ForbiddenException('User not authenticated');
    }

    // Get IP address from request
    const ipAddress = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress;

    return this.usersService.updateProfile(userId, updateProfileDto, ipAddress, userAgent);
  }

  @Get('profile')
  @ApiOperation({
    summary: 'Get current user profile',
    description: "Retrieve the authenticated user's profile information.",
  })
  @ApiResponse({
    status: 200,
    description: 'Profile retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async getCurrentProfile(@Request() req: any): Promise<ProfileResponseDto> {
    // Get the authenticated user's ID
    const userId = req.user.sub;
    if (!userId) {
      throw new ForbiddenException('User not authenticated');
    }

    return this.usersService.getProfile(userId);
  }

  @Get('search')
  @ApiOperation({
    summary: 'Search users (Admin only)',
    description:
      'Search for users by email, first name, last name, or full name with fuzzy matching and filtering. Requires admin role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Search results retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              email: { type: 'string' },
              firstName: { type: 'string', nullable: true },
              lastName: { type: 'string', nullable: true },
              fullName: { type: 'string', nullable: true },
              phoneNumber: { type: 'string', nullable: true },
              avatar: { type: 'string', nullable: true },
              role: { type: 'string', enum: ['USER', 'HEALER', 'ADMIN'] },
              status: { type: 'string', enum: ['active', 'inactive', 'suspended'] },
              isVerified: { type: 'boolean' },
              country: { type: 'string', nullable: true },
              preferredLanguage: { type: 'string', nullable: true },
              lastActiveAt: { type: 'string', format: 'date-time', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
              updatedAt: { type: 'string', format: 'date-time' },
              score: { type: 'number', nullable: true },
            },
          },
        },
        total: { type: 'number' },
        page: { type: 'number' },
        limit: { type: 'number' },
        totalPages: { type: 'number' },
        query: { type: 'string', nullable: true },
        executionTimeMs: { type: 'number' },
        fuzzyUsed: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid search parameters',
  })
  @Roles(Role.ADMIN)
  async searchUsers(@Query() searchDto: UserSearchDto): Promise<UserSearchResponseDto> {
    return this.userSearchService.searchUsers(searchDto);
  }

  @Get('search/suggestions')
  @ApiOperation({
    summary: 'Get search suggestions (Admin only)',
    description: 'Get search suggestions based on partial input. Requires admin role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Search suggestions retrieved successfully',
    schema: {
      type: 'array',
      items: { type: 'string' },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Partial input too short',
  })
  @Roles(Role.ADMIN)
  async getSearchSuggestions(
    @Query('partial') partial: string,
    @Query('limit') limit?: number
  ): Promise<string[]> {
    if (!partial || partial.length < 2) {
      return [];
    }

    const suggestionLimit = limit ? Math.min(Math.max(limit, 1), 50) : 10;
    return this.userSearchService.getSearchSuggestions(partial, suggestionLimit);
  }

  @Get('search/stats')
  @ApiOperation({
    summary: 'Get search statistics (Admin only)',
    description: 'Get search performance and usage statistics. Requires admin role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Search statistics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        totalUsers: { type: 'number' },
        searchableFields: {
          type: 'array',
          items: { type: 'string' },
        },
        averageSearchTime: { type: 'number', nullable: true },
        popularFilters: { type: 'object', nullable: true },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @Roles(Role.ADMIN)
  async getSearchStats() {
    return this.userSearchService.getSearchStats();
  }

  @Post('avatar')
  @ApiOperation({ summary: 'Upload user avatar' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(
    @UploadedFile() file: any,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    return this.avatarService.uploadAvatar(
      req.user.userId,
      file.buffer,
      file.originalname,
      file.mimetype,
      req,
    );
  }

  @Delete('avatar')
  @ApiOperation({ summary: 'Delete user avatar' })
  async deleteAvatar(@Req() req: AuthenticatedRequest) {
    await this.avatarService.deleteAvatar(req.user.userId, req);
    return { success: true };
  }

  @Get('avatar')
  @ApiOperation({ summary: 'Get user avatar URL' })
  async getAvatar(@Req() req: AuthenticatedRequest) {
    const avatarUrl = await this.avatarService.getAvatarUrl(req.user.userId);
    return { avatarUrl };
  }
}
