import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { WalletSummaryDto } from './dto/wallet-summary.dto';
import { LinkWalletDto } from './dto/link-wallet.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@ApiTags('Wallet')
@Controller('users/me/wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('summary')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user wallet summary' })
  @ApiResponse({
    status: 200,
    description: 'Wallet summary retrieved successfully',
    type: WalletSummaryDto,
  })
  async getSummary(@Request() req): Promise<WalletSummaryDto> {
    return this.walletService.getWalletSummary(req.user.sub);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Link Stellar wallet address' })
  @ApiResponse({
    status: 200,
    description: 'Wallet address linked successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid address format or account not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict - Address already linked to another account',
  })
  async linkWallet(
    @Request() req,
    @Body() linkWalletDto: LinkWalletDto,
  ): Promise<{ message: string }> {
    await this.walletService.linkWallet(req.user.sub, linkWalletDto.address);
    return { message: 'Wallet linked successfully' };
  }
}
