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
import { AdminUsersService } from './services/admin-users.service';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/auth/guards/roles.guard';
import { Roles } from '@/auth/decorators/roles.decorator';
import { Role } from '@/auth/enums/role.enum';
import { ListUsersDto } from '@/admin/dto/list-users.dto';
import { CreateAdminDto } from '@/admin/dto/create-admin.dto';
import { ChangeRoleDto } from '@/admin/dto/change-role.dto';

@ApiTags('Admin - User Management')
@ApiBearerAuth()
@ApiSecurity('bearer')
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new admin user' })
  @ApiResponse({ status: 201, description: 'Admin user created successfully' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  async createAdmin(@Req() req: any, @Body() dto: CreateAdminDto) {
    return this.adminUsersService.createAdminUser(req.user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List users with filters and pagination' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  async list(@Query() dto: ListUsersDto) {
    return this.adminUsersService.listUsers(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiParam({ name: 'id', description: 'User ID', type: 'string' })
  @ApiResponse({ status: 200, description: 'User found' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getById(@Param('id') id: string) {
    return this.adminUsersService.getUserById(id);
  }

  @Patch(':id/role')
  @ApiOperation({ summary: 'Change user role' })
  @ApiResponse({ status: 200, description: 'Role updated successfully' })
  async changeRole(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ChangeRoleDto,
  ) {
    return this.adminUsersService.changeRole(req.user.sub, id, dto.role);
  }

  @Patch(':id/suspend')
  @ApiOperation({ summary: 'Suspend a user account' })
  @ApiResponse({ status: 200, description: 'User suspended successfully' })
  async suspend(@Req() req: any, @Param('id') id: string) {
    return this.adminUsersService.suspendUser(req.user.sub, id);
  }

  @Patch(':id/reactivate')
  @ApiOperation({ summary: 'Reactivate a user account' })
  @ApiResponse({ status: 200, description: 'User reactivated successfully' })
  async reactivate(@Req() req: any, @Param('id') id: string) {
    return this.adminUsersService.reactivateUser(req.user.sub, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a user account' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  async delete(@Req() req: any, @Param('id') id: string) {
    return this.adminUsersService.deleteUser(req.user.sub, id);
  }
}
