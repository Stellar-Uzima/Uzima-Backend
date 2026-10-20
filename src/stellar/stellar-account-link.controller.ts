import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { StellarAccountLinkService } from './stellar-account-link.service';
import { LinkStellarAccountDto } from './dto/link-stellar-account.dto';

interface AuthenticatedRequest extends Request {
  user?: { userId?: string; sub?: string };
}

@ApiTags('Stellar Account Linking')
@ApiBearerAuth()
@Controller('stellar/account')
@UseGuards(JwtAuthGuard)
export class StellarAccountLinkController {
  constructor(private readonly accountLinkService: StellarAccountLinkService) {}

  @Post('link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Link the authenticated user's Stellar account",
    description:
      'Validates the public key and verifies ownership via an ed25519 ' +
      'signature over the sha256 digest of "Uzima Stellar linking:<userId>:<publicKey>".',
  })
  @ApiResponse({ status: 200, description: 'Account linked (VERIFIED or PENDING)' })
  @ApiResponse({ status: 400, description: 'Invalid key or ownership signature' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 409, description: 'Link already exists for user or key' })
  async linkAccount(@Body() dto: LinkStellarAccountDto, @Req() req: AuthenticatedRequest) {
    return this.accountLinkService.linkAccount(this.resolveUserId(req), dto);
  }

  @Get()
  @ApiOperation({ summary: "Get the authenticated user's linked Stellar account" })
  @ApiResponse({ status: 200, description: 'Link returned (null when none)' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getAccount(@Req() req: AuthenticatedRequest) {
    return this.accountLinkService.getAccount(this.resolveUserId(req));
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove the authenticated user's Stellar account link" })
  @ApiResponse({ status: 204, description: 'Link removed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'No link exists for this user' })
  async removeAccount(@Req() req: AuthenticatedRequest): Promise<void> {
    await this.accountLinkService.removeAccount(this.resolveUserId(req));
  }

  private resolveUserId(req: AuthenticatedRequest): string {
    const userId = req.user?.userId ?? req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Authenticated user id missing from token');
    }
    return userId;
  }
}
