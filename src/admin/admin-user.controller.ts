import {
  Controller,
  Get,
  Param,
  Patch,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ListUsersDto } from '../dto/list-users.dto';
import { AdminUsersService } from '../services/admin-users.service';
import { Role } from 'src/auth/enums/role.enum';

@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminUsersController {
  constructor(private adminUsersService: AdminUsersService) {}

  @Get()
  async list(@Body() dto: ListUsersDto) {
    return this.adminUsersService.listUsers(dto);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.adminUsersService.getUserById(id);
  }

  @Patch(':id/role')
  async changeRole(
    @Req() req,
    @Param('id') id: string,
    @Body('role') role: Role,
  ) {
    const adminId = req.user.sub;
    return this.adminUsersService.changeRole(adminId, id, role);
  }

  @Patch(':id/suspend')
  async suspend(@Req() req, @Param('id') id: string) {
    const adminId = req.user.sub;
    return this.adminUsersService.suspendUser(adminId, id);
  }
}
