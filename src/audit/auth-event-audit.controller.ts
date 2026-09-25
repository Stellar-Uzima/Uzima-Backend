import { Controller, Get, Query, UseGuards, Version } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { Roles } from '@modules/auth/decorators/roles.decorator';
import { Role } from '@modules/auth/enums/role.enum';
import { QueryAuthEventsDto } from './dto/query-auth-events.dto';
import {
  AuthEventAuditService,
  PaginatedAuthEvents,
} from './services/auth-event-audit.service';

/**
 * Admin read-only view over the authentication audit trail (#1289).
 *
 * The trail exists so security reviewers can answer "who tried to sign in, from
 * where, and when". That data is sensitive, so every route requires both a
 * valid token and the `ACCESS_ADMIN` grant via `@Roles(Role.ADMIN)`.
 */
@ApiTags('Audit - Authentication Events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Roles(Role.ADMIN)
@Controller({ path: 'admin/audit/auth-events' })
@Version('1')
export class AuthEventAuditController {
  constructor(private readonly authEventAuditService: AuthEventAuditService) {}

  @Get()
  @ApiOperation({
    summary: 'List authentication audit events',
    description:
      'Returns a filtered, paginated slice of the append-only auth event trail ' +
      '(logins, logouts, token refresh/revocation, password changes and resets, ' +
      'lockouts, and account deactivation). Newest first.',
  })
  @ApiResponse({ status: 200, description: 'Auth events returned' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  @ApiResponse({ status: 403, description: 'Requires the ADMIN role' })
  async list(@Query() query: QueryAuthEventsDto): Promise<PaginatedAuthEvents> {
    return this.authEventAuditService.findAll({
      page: query.page,
      limit: query.limit,
      userId: query.userId,
      eventType: query.eventType,
      outcome: query.outcome,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    });
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Summarise recent authentication activity for a user',
    description:
      'Returns the last successful login, last failed attempt, last logout, and ' +
      'the number of failed attempts in the trailing 15-minute lockout window.',
  })
  @ApiResponse({ status: 200, description: 'Summary returned' })
  @ApiResponse({ status: 400, description: 'userId query parameter is required' })
  @ApiResponse({ status: 403, description: 'Requires the ADMIN role' })
  async summarise(
    @Query('userId') userId: string,
  ): Promise<{
    userId: string;
    lastLoginAt: Date | null;
    lastFailedLoginAt: Date | null;
    lastLogoutAt: Date | null;
    failedAttemptsInWindow: number;
  }> {
    const summary = await this.authEventAuditService.summariseForUser(userId);
    return { userId, ...summary };
  }

  @Get('retention')
  @ApiOperation({
    summary: 'Show the configured auth-event retention policy',
    description:
      'Returns the retention window currently applied to auth event rows and the ' +
      'count still inside it, so operators can verify the policy matches their ' +
      'compliance obligations.',
  })
  @ApiResponse({ status: 200, description: 'Retention policy returned' })
  async retention(): Promise<{ retentionDays: number; note: string }> {
    return {
      retentionDays: this.authEventAuditService.configuredRetentionDays,
      note: 'Rows are removed by AuthEventAuditService.purgeExpired(), which is safe to run on a schedule.',
    };
  }
}
