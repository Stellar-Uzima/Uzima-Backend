import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@modules/auth/decorators/roles.decorator';
import { Role } from '@modules/auth/enums/role.enum';
import { AuditService } from './audit.service';
import { CreateAuditDto } from './dto/create-audit.dto';
import { AuditAction, AuditResource } from './enums/audit.enums';

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Get paginated audit logs with optional date filtering' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Paginated audit logs returned' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin only' })
  async findAllPaginated(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const result = await this.auditService.findAllPaginated({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    // Audit queries over the audit trail are themselves audited.
    await this.auditService.logEvent({
      userId: req?.user?.id ?? req?.user?.userId,
      userEmail: req?.user?.email,
      userRole: req?.user?.role,
      action: AuditAction.VIEW,
      resourceType: AuditResource.ADMIN,
      description: 'Queried audit logs',
      ipAddress: req?.ip,
      userAgent: req?.headers?.['user-agent'],
      requestId: req?.headers?.['x-request-id'],
      isSensitive: true,
      metadata: {
        query: { page, limit, startDate, endDate },
        resultCount: result.total,
      },
    });

    return result;
  }

  @Post()
  create(@Body() createAuditDto: CreateAuditDto) {
    return this.auditService.create(createAuditDto);
  }
}
