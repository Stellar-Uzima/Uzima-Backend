import {
  Controller,
  Get,
  Post,
  Param,
  Patch,
  Delete,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiSecurity,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ListUsersDto } from './dto/list-users.dto';
import { CreateAdminDto } from './dto/create-admin.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { AdminUserResponseDto } from './dto/user-response.dto';
import { AdminUsersService } from './services/admin-users.service';
import { Role } from 'src/auth/enums/role.enum';

@ApiTags('Admin - User Management')
@ApiBearerAuth()
@ApiSecurity('bearer')
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminUsersController {
  constructor(private adminUsersService: AdminUsersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new admin user' })
  @ApiResponse({
    status: 201,
    description: 'Admin user created successfully',
    type: AdminUserResponseDto,
  })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  async createAdmin(@Req() req, @Body() dto: CreateAdminDto) {
    const adminId = req.user.sub;
    return this.adminUsersService.createAdminUser(adminId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List all users with filters and pagination',
    description: 'Retrieves a paginated list of users with optional filters. Requires ADMIN role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Users retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { $ref: '#/components/schemas/AdminUserResponseDto' } },
        total: { type: 'number' },
        page: { type: 'number' },
        limit: { type: 'number' },
        totalPages: { type: 'number' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - requires ADMIN role',
  })
  async list(@Query() dto: ListUsersDto) {
    return this.adminUsersService.listUsers(dto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get user by ID',
    description: 'Retrieves a specific user by their ID. Requires ADMIN role.',
  })
  @ApiParam({
    name: 'id',
    description: 'User ID (UUID)',
    type: 'string',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'User found',
    type: AdminUserResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid user ID format',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  // mmmm
  @ApiResponse({
    status: 403,
    description: 'Forbidden - requires ADMIN role',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async getById(@Param('id') id: string) {
    return this.adminUsersService.getUserById(id);
  }

  @Patch(':id/role')
  @ApiOperation({
    summary: 'Change user role',
    description: 'Updates the role of a specific user. Cannot change own role. Requires ADMIN role.',
  })
  @ApiParam({
    name: 'id',
    description: 'User ID (UUID)',
    type: 'string',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Role updated successfully',
    type: AdminUserResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - requires ADMIN role, or cannot change own role',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async changeRole(
    @Req() req,
    @Param('id') id: string,
    @Body() dto: ChangeRoleDto,
  ) {
    const adminId = req.user.sub;
    return this.adminUsersService.changeRole(adminId, id, dto.role);
  }

  @Patch(':id/suspend')
  @ApiOperation({
    summary: 'Suspend user account',
    description: 'Suspends a user account. Cannot suspend own account. Requires ADMIN role.',
  })
  @ApiParam({
    name: 'id',
    description: 'User ID (UUID)',
    type: 'string',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'User suspended successfully',
    type: AdminUserResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - requires ADMIN role, or cannot suspend own account',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async suspend(@Req() req, @Param('id') id: string) {
    const adminId = req.user.sub;
    return this.adminUsersService.suspendUser(adminId, id);
  }

  @Patch(':id/reactivate')
  @ApiOperation({ summary: 'Reactivate user account' })
  @ApiResponse({
    status: 200,
    description: 'User reactivated successfully',
    type: AdminUserResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Cannot reactivate own account' })
  async reactivate(@Req() req, @Param('id') id: string) {
    const adminId = req.user.sub;
    return this.adminUsersService.reactivateUser(adminId, id);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete user account',
    description: 'Permanently deletes a user account. Cannot delete own account. Requires ADMIN role.',
  })
  @ApiParam({
    name: 'id',
    description: 'User ID (UUID)',
    type: 'string',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'User deleted successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - requires ADMIN role, or cannot delete own account',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async delete(@Req() req, @Param('id') id: string) {
    const adminId = req.user.sub;
    return this.adminUsersService.deleteUser(adminId, id);
  }
}
