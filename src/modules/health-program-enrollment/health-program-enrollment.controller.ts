import {
  Controller,
  Get,
  Param,
  Patch,
  Body,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { Role } from '@modules/auth/enums/role.enum';
import { HealthProgramEnrollmentService } from './health-program-enrollment.service';
import { UpdateEnrollmentStateDto } from './dto/update-enrollment-state.dto';

interface AuthenticatedRequest {
  user: { sub?: string; userId?: string; id?: string; role: Role };
}

@ApiTags('Health program enrollment')
@ApiBearerAuth()
@Controller('users/me/health-program-enrollments')
@UseGuards(JwtAuthGuard)
export class HealthProgramEnrollmentController {
  constructor(private readonly enrollmentService: HealthProgramEnrollmentService) {}

  @Get()
  @ApiOperation({ summary: 'List the current user’s health program enrollments' })
  @ApiResponse({ status: 200, description: 'Current user enrollments' })
  async list(@Req() req: AuthenticatedRequest) {
    return this.enrollmentService.listForUser(this.userId(req));
  }

  @Get(':programCode')
  @ApiOperation({ summary: "Get the current user's health program enrollment" })
  @ApiResponse({ status: 200, description: 'Current user enrollment' })
  @ApiResponse({ status: 404, description: 'Enrollment not found' })
  async get(@Req() req: AuthenticatedRequest, @Param('programCode') programCode: string) {
    return this.enrollmentService.getEnrollment(this.userId(req), programCode);
  }

  @Get(':programCode/history')
  @ApiOperation({ summary: "Get the current user's enrollment history for a program" })
  @ApiResponse({ status: 200, description: 'Enrollment transition history' })
  async history(@Req() req: AuthenticatedRequest, @Param('programCode') programCode: string) {
    return this.enrollmentService.getHistory(this.userId(req), programCode);
  }

  @Patch(':programCode')
  @ApiOperation({ summary: 'Enroll in or withdraw from a health program' })
  @ApiResponse({ status: 200, description: 'Enrollment state updated' })
  @ApiResponse({ status: 409, description: 'Invalid enrollment transition' })
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('programCode') programCode: string,
    @Body() dto: UpdateEnrollmentStateDto
  ) {
    return this.enrollmentService.updateState(
      this.userId(req),
      programCode,
      this.userId(req),
      req.user.role,
      dto
    );
  }

  private userId(req: AuthenticatedRequest): string {
    const userId = req.user?.sub ?? req.user?.userId ?? req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Authenticated request is missing a user ID');
    }
    return userId;
  }
}
