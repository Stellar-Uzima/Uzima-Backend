import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UserFilterDto } from './dto/user-filter.dto';
import { UserStatusChangeDto, UserStatusResponseDto } from './dto/user-status-change.dto';
import { PaginatedResponseDto } from '../../common/dtos/pagination.dto';
import { User } from '../../entities/user.entity';
import { UserStatusLog } from '../../entities/user-status-log.entity';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '../../auth/enums/role.enum';

@ApiTags('users')
@Controller('users')
@UseGuards(RolesGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
  @ApiOperation({
    summary: 'Get user by ID (Admin only)',
    description: 'Retrieve a specific user by their ID. Requires admin role.',
  })
  @ApiResponse({
    status: 200,
    description: 'User retrieved successfully',
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
  async findOne(@Param('id') id: string, @Request() req: any): Promise<User> {
    // Verify admin role
    const currentUser = req.user;
    if (currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }

    const user = await this.usersService.findOne(id);
    if (!user) {
      throw new ForbiddenException('User not found');
    }
    return user;
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
}
