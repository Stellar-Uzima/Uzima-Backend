import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@modules/auth/decorators/roles.decorator';
import { Role } from '@modules/auth/enums/role.enum';
import { StellarService } from './stellar.service';
import { StellarTransactionTrackingService } from './stellar-transaction-tracking.service';
import { StellarReconciliationService } from './stellar-reconciliation.service';
import { VerifyStellarTransactionDto } from './dto/verify-stellar-transaction.dto';
import { TrackStellarTransactionDto } from './dto/track-stellar-transaction.dto';
import { ReconciliationQueryDto } from './dto/reconciliation-query.dto';

interface AuthenticatedRequest extends Request {
  user?: { userId?: string; sub?: string };
}

@ApiTags('Stellar Transactions')
@ApiBearerAuth()
@Controller('stellar')
@UseGuards(JwtAuthGuard)
export class StellarTransactionController {
  private readonly logger = new Logger(StellarTransactionController.name);

  constructor(
    private readonly stellarService: StellarService,
    private readonly trackingService: StellarTransactionTrackingService,
    private readonly reconciliationService: StellarReconciliationService
  ) {}

  @Post('transaction/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify a Stellar transaction signature and network binding',
    description:
      'Parses the envelope with the configured network passphrase and checks ' +
      'the ed25519 signature over the transaction signature base. Invalid ' +
      'submissions are rejected and logged; no secrets are exposed.',
  })
  @ApiResponse({ status: 200, description: '{ valid, reason? }' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async verifyTransaction(@Body() dto: VerifyStellarTransactionDto) {
    const valid = this.stellarService.verifyTransactionSignature(
      dto.xdr,
      dto.signature,
      dto.publicKey
    );
    if (!valid) {
      this.logger.warn(
        `Rejected invalid Stellar transaction signature for publicKey=${dto.publicKey}`
      );
      return {
        valid: false,
        reason:
          'Signature does not match the transaction signature base for the given public key',
      };
    }
    return { valid: true };
  }

  @Post('transaction/track')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Record a submitted Stellar transaction and refresh its status',
    description:
      'Upserts a SUBMITTED record under the unique network hash, then polls ' +
      'Horizon once for the lifecycle outcome. Idempotent for re-submissions.',
  })
  @ApiResponse({ status: 200, description: 'Tracked transaction record' })
  @ApiResponse({ status: 400, description: 'Invalid hash' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async trackTransaction(
    @Body() dto: TrackStellarTransactionDto,
    @Req() req: AuthenticatedRequest
  ) {
    const userId = this.resolveUserId(req);
    const record = await this.trackingService.trackTransaction(dto, userId);
    try {
      return await this.trackingService.refreshStatus(dto.hash, userId);
    } catch {
      // Horizon unreachable — the SUBMITTED record is stored for later polling.
      return record;
    }
  }

  @Get('transaction/:hash')
  @ApiOperation({ summary: "Get the authenticated user's tracked Stellar transaction" })
  @ApiResponse({ status: 200, description: 'Tracked transaction record' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Not tracked for this user' })
  async getTransaction(@Param('hash') hash: string, @Req() req: AuthenticatedRequest) {
    const record = await this.trackingService.getRecord(hash, this.resolveUserId(req));
    if (!record) {
      throw new NotFoundException('Stellar transaction not found');
    }
    return record;
  }

  @Get('reconciliation')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Reconcile treasury payments against platform records (admin)',
    description:
      'Compares confirmed incoming payments for the treasury account in the ' +
      'given window with stellar transaction records and wallet top-ups. ' +
      'Report-only: balances are never altered.',
  })
  @ApiQuery({ name: 'from', required: true, description: 'ISO 8601 start of window' })
  @ApiQuery({ name: 'to', required: true, description: 'ISO 8601 end of window' })
  @ApiResponse({ status: 200, description: 'Matched/unmatched/orphaned report' })
  @ApiResponse({ status: 400, description: 'Invalid window or treasury not configured' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin only' })
  async reconcile(@Query() query: ReconciliationQueryDto) {
    return this.reconciliationService.reconcile(new Date(query.from), new Date(query.to));
  }

  private resolveUserId(req: AuthenticatedRequest): string {
    const userId = req.user?.userId ?? req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Authenticated user id missing from token');
    }
    return userId;
  }
}
