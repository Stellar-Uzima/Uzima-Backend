import { Body, Controller, Get, Ip, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@modules/auth/decorators/roles.decorator';
import { Role } from '@modules/auth/enums/role.enum';
import { UserDirectoryService } from '../services/user-directory.service';
import { UserDeactivationService, ActorContext } from '../services/user-deactivation.service';
import { UserDirectoryQueryDto } from '../dto/user-directory-query.dto';
import {
  DeactivateUserDto,
  DeactivationHistoryQueryDto,
  DeactivationResultDto,
  ReactivateUserDto,
} from '../dto/deactivate-user.dto';
import { SORTABLE_COLUMNS } from '@/common/dto/api-pagination.query.dto';

interface AuthenticatedRequest {
  user: { sub: string; email?: string; role: Role };
  headers: Record<string, string | string[] | undefined>;
}

@ApiTags('Admin - User Directory & Lifecycle')
@ApiBearerAuth()
@ApiSecurity('bearer')
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class UserDirectoryController {
  constructor(
    private readonly directoryService: UserDirectoryService,
    private readonly deactivationService: UserDeactivationService,
  ) {}

  @Get('directory')
  @ApiOperation({
    summary: 'Search and filter users (#1294)',
    description:
      'Composable filters combined with AND. Free-text `q` matches email, first name, ' +
      'last name and full name with LIKE wildcards escaped. `sortBy` is checked against a ' +
      'fixed allowlist, so ordering parameters cannot be used to inject SQL. Results are ' +
      'returned as { data, meta } with stable ordering, so paging neither repeats nor drops a row.',
  })
  @ApiQuery({ name: 'q', description: 'Free-text search', required: false, type: String })
  @ApiQuery({ name: 'sortBy', description: 'Sort column', required: false, enum: SORTABLE_COLUMNS as unknown as string[] })
  @ApiQuery({ name: 'cursor', description: 'Opaque cursor from a previous response', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Matching users' })
  @ApiResponse({ status: 400, description: 'Invalid filter combination' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  async search(@Query() dto: UserDirectoryQueryDto) {
    return this.directoryService.search(dto);
  }

  @Post(':id/deactivate')
  @ApiOperation({
    summary: 'Deactivate a user account (#1291)',
    description:
      'Soft, reversible and audited. Sets status=inactive and isActive=false, clears the ' +
      'refresh token, revokes persisted sessions, and writes both a user_status_logs row and ' +
      'a hash-chained compliance audit event. Requires confirm=true. The user row is retained: ' +
      'wallet, task and reward history reference it, and deleting it would break the audit chain.',
  })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Account deactivated', type: DeactivationResultDto })
  @ApiResponse({ status: 400, description: 'confirm not set, self-deactivation, or missing reason for OTHER' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 409, description: 'Already inactive, or the last active admin' })
  async deactivate(
    @Param('id') id: string,
    @Body() dto: DeactivateUserDto,
    @Req() req: AuthenticatedRequest,
    @Ip() ip: string,
  ) {
    return this.deactivationService.deactivate(id, dto, this.actor(req, ip));
  }

  @Post(':id/reactivate')
  @ApiOperation({
    summary: 'Reactivate a user account (#1291)',
    description:
      'Restores status=active and isActive=true, clears any lockout counters, and does not ' +
      'restore the previous session: the user signs in again. Accounts deactivated for ' +
      'suspicious activity are refused and require a security review.',
  })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Account reactivated', type: DeactivationResultDto })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 409, description: 'Already active, or flagged for security review' })
  async reactivate(
    @Param('id') id: string,
    @Body() dto: ReactivateUserDto,
    @Req() req: AuthenticatedRequest,
    @Ip() ip: string,
  ) {
    return this.deactivationService.reactivate(id, dto, this.actor(req, ip));
  }

  @Get(':id/deactivation-history')
  @ApiOperation({
    summary: 'Deactivation history for a user (#1291)',
    description: 'Most recent status transitions first, including who made each change and why.',
  })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Status change history' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async history(@Param('id') id: string, @Query() dto: DeactivationHistoryQueryDto) {
    return this.deactivationService.history(id, dto.limit);
  }

  private actor(req: AuthenticatedRequest, ip: string): ActorContext {
    const userAgent = req.headers['user-agent'];
    return {
      id: req.user.sub,
      role: req.user.role,
      ipAddress: ip,
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    };
  }
}
