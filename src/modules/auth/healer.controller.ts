import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { Role } from './enums/role.enum';

@ApiTags('Healer')
@ApiBearerAuth()
@Controller('healer')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HealerController {
  @Get('dashboard')
  @Roles(Role.HEALER, Role.ADMIN)
  @ApiOperation({ summary: 'Get healer or admin dashboard' })
  getDashboard() {
    return { message: 'Welcome healer or admin' };
  }

  @Get('admin-only')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get admin-only endpoint' })
  getAdmin() {
    return { message: 'Admin only endpoint' };
  }
}
