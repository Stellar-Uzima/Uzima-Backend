import {
  Controller,
  Get,
  Param,
  Patch,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ListUsersDto } from './dto/list-users.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { AdminUsersService } from './services/admin-users.service';
import { Role } from 'src/auth/enums/role.enum';

@ApiTags('Admin - User Management')
@ApiBearerAuth()
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminUsersController {
  constructor(private adminUsersService: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: 'List all users with filters and pagination' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  async list(@Query() dto: ListUsersDto) {
    return this.adminUsersService.listUsers(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({ status: 200, description: 'User found', type: UserResponseDto })
  @ApiResponse({ status: 400, description: 'User not found' })
  async getById(@Param('id') id: string) {
    return this.adminUsersService.getUserById(id);
  }

  @Patch(':id/role')
  @ApiOperation({ summary: 'Change user role' })
  @ApiResponse({ status: 200, description: 'Role updated successfully', type: UserResponseDto })
  @ApiResponse({ status: 403, description: 'Cannot change own role' })
  async changeRole(
    @Req() req,
    @Param('id') id: string,
    @Body() dto: ChangeRoleDto,
  ) {
    const adminId = req.user.sub;
    return this.adminUsersService.changeRole(adminId, id, dto.role);
  }

  @Patch(':id/suspend')
  @ApiOperation({ summary: 'Suspend user account' })
  @ApiResponse({ status: 200, description: 'User suspended successfully', type: UserResponseDto })
  @ApiResponse({ status: 403, description: 'Cannot suspend own account' })
  async suspend(@Req() req, @Param('id') id: string) {
    const adminId = req.user.sub;
    return this.adminUsersService.suspendUser(adminId, id);
  }
}
