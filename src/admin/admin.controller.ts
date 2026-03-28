import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiSecurity,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { TasksScheduler } from '../tasks/tasks.scheduler';

@ApiTags('Admin - Management')
@ApiBearerAuth()
@ApiSecurity('bearer')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly tasksScheduler: TasksScheduler,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new admin',
    description: 'Creates a new admin user. Requires ADMIN role.',
  })
  @ApiResponse({
    status: 201,
    description: 'Admin created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid input data',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - requires ADMIN role',
  })
  create(@Body() createAdminDto: CreateAdminDto) {
    return this.adminService.create(createAdminDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all admins',
    description: 'Retrieves list of all admins. Requires ADMIN role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Admins retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - requires ADMIN role',
  })
  findAll() {
    return this.adminService.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get admin by ID',
    description: 'Retrieves a specific admin by ID. Requires ADMIN role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Admin found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - requires ADMIN role',
  })
  @ApiResponse({
    status: 404,
    description: 'Admin not found',
  })
  findOne(@Param('id') id: string) {
    return this.adminService.findOne(+id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update admin',
    description: 'Updates an existing admin. Requires ADMIN role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Admin updated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid input data',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - requires ADMIN role',
  })
  @ApiResponse({
    status: 404,
    description: 'Admin not found',
  })
  update(@Param('id') id: string, @Body() updateAdminDto: UpdateAdminDto) {
    return this.adminService.update(+id, updateAdminDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete admin',
    description: 'Deletes an admin by ID. Requires ADMIN role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Admin deleted successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - requires ADMIN role',
  })
  @ApiResponse({
    status: 404,
    description: 'Admin not found',
  })
  remove(@Param('id') id: string) {
    return this.adminService.remove(+id);
  }

  @Post('tasks/assign-daily')
  @ApiOperation({
    summary: 'Manually trigger daily task assignment',
    description: 'Triggers the daily task assignment process for all active users. Requires ADMIN role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Daily task assignment completed successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        processed: { type: 'number' },
        errors: { type: 'array', items: { type: 'string' } },
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
  async assignDailyTasks() {
    const result = await this.tasksScheduler.assignDailyTasksManually();
    return {
      message: 'Daily task assignment completed',
      processed: result.processed,
      errors: result.errors,
    };
  }
}
