import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { Role } from './enums/role.enum';

@ApiTags('healer')
@ApiBearerAuth()
@Controller('healer')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HealerController {
  @Get('dashboard')
  @Roles(Role.HEALER, Role.ADMIN)
  @ApiOperation({ summary: 'Get the dashboard for authenticated healers or admins' })
  @ApiResponse({ status: 200, description: 'Dashboard retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient role' })
  getDashboard() {
    return { message: 'Welcome healer or admin' };
  }

  @Get('admin-only')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get the admin-only healer management endpoint' })
  @ApiResponse({ status: 200, description: 'Admin data retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires admin role' })
  getAdmin() {
    return { message: 'Admin only endpoint' };
  }
}
