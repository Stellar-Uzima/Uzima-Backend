import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from './enums/role.enum';

@Controller('healer')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HealerController {
  @Get('dashboard')
  @Roles(Role.HEALER, Role.ADMIN)
  getDashboard() {
    return { message: 'Welcome healer or admin' };
  }

  @Get('admin-only')
  @Roles(Role.ADMIN)
  getAdmin() {
    return { message: 'Admin only endpoint' };
  }
}
