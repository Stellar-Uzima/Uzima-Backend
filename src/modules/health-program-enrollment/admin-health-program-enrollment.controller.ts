import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@modules/auth/decorators/roles.decorator';
import { Role } from '@modules/auth/enums/role.enum';
import { HealthProgramEnrollmentService } from './health-program-enrollment.service';
import { UpdateEnrollmentStateDto } from './dto/update-enrollment-state.dto';

interface AuthenticatedRequest {
  user: { sub?: string; userId?: string; id?: string; role: Role };
}

@ApiTags('Admin - Health program enrollment')
@ApiBearerAuth()
@ApiSecurity('bearer')
@Controller('admin/users/:userId/health-program-enrollments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminHealthProgramEnrollmentController {
  constructor(private readonly enrollmentService: HealthProgramEnrollmentService) {}

  @Get(':programCode')
  @ApiOperation({ summary: "Get a user's health program enrollment" })
  @ApiResponse({ status: 200, description: 'Enrollment state' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  @ApiResponse({ status: 404, description: 'Enrollment not found' })
  async get(@Param('userId') userId: string, @Param('programCode') programCode: string) {
    return this.enrollmentService.getEnrollment(userId, programCode);
  }

  @Patch(':programCode')
  @ApiOperation({ summary: "Update a user's health program eligibility or enrollment state" })
  @ApiResponse({ status: 200, description: 'Enrollment state updated' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  @ApiResponse({ status: 409, description: 'Invalid enrollment transition' })
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('userId') userId: string,
    @Param('programCode') programCode: string,
    @Body() dto: UpdateEnrollmentStateDto
  ) {
    return this.enrollmentService.updateState(
      userId,
      programCode,
      this.actorId(req),
      req.user.role,
      dto
    );
  }

  @Get(':programCode/history')
  @ApiOperation({ summary: "Get a user's health program enrollment history" })
  @ApiResponse({ status: 200, description: 'Enrollment transition history' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  async history(@Param('userId') userId: string, @Param('programCode') programCode: string) {
    return this.enrollmentService.getHistory(userId, programCode);
  }

  private actorId(req: AuthenticatedRequest): string {
    const actorId = req.user?.sub ?? req.user?.userId ?? req.user?.id;
    if (!actorId) {
      throw new UnauthorizedException('Authenticated request is missing a user ID');
    }
    return actorId;
  }
}
