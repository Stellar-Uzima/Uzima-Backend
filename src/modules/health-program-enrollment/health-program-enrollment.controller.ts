import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { Role } from '@modules/auth/enums/role.enum';
import { UpdateEnrollmentStatusDto } from './dto/update-enrollment-status.dto';
import { HealthProgramEnrollmentService } from './health-program-enrollment.service';

interface AuthenticatedRequest extends Request {
  user: {
    sub?: string;
    userId?: string;
    role: Role;
  };
}

@Controller('health-program-enrollments')
@UseGuards(JwtAuthGuard)
export class HealthProgramEnrollmentController {
  constructor(private readonly enrollmentService: HealthProgramEnrollmentService) {}

  @Get('me')
  getMyEnrollment(@Req() req: AuthenticatedRequest) {
    const actorId = this.getActorId(req);
    return this.enrollmentService.getEnrollment(actorId, actorId, req.user.role);
  }

  @Get('me/history')
  getMyHistory(@Req() req: AuthenticatedRequest) {
    const actorId = this.getActorId(req);
    return this.enrollmentService.getHistory(actorId, actorId, req.user.role);
  }

  @Patch('me')
  updateMyEnrollment(@Req() req: AuthenticatedRequest, @Body() dto: UpdateEnrollmentStatusDto) {
    return this.enrollmentService.updateStatus(
      this.getActorId(req),
      this.getActorId(req),
      req.user.role,
      dto
    );
  }

  @Get(':userId')
  getEnrollment(@Req() req: AuthenticatedRequest, @Param('userId') userId: string) {
    return this.enrollmentService.getEnrollment(userId, this.getActorId(req), req.user.role);
  }

  @Get(':userId/history')
  getHistory(@Req() req: AuthenticatedRequest, @Param('userId') userId: string) {
    return this.enrollmentService.getHistory(userId, this.getActorId(req), req.user.role);
  }

  @Patch(':userId')
  updateEnrollment(
    @Req() req: AuthenticatedRequest,
    @Param('userId') userId: string,
    @Body() dto: UpdateEnrollmentStatusDto
  ) {
    return this.enrollmentService.updateStatus(userId, this.getActorId(req), req.user.role, dto);
  }

  private getActorId(req: AuthenticatedRequest): string {
    const actorId = req.user.sub ?? req.user.userId;
    if (!actorId) {
      throw new ForbiddenException('Authenticated user ID is unavailable');
    }
    return actorId;
  }
}
