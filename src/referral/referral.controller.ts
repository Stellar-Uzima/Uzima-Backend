import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReferralService } from './referral.service';
import { RedeemReferralDto } from './dto/redeem-referral.dto';

@ApiTags('referrals')
@Controller('referrals')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate a unique referral code for the current user' })
  @ApiResponse({ status: 201, description: 'Referral code created or returned' })
  async generate(@Req() req: { user: { id?: string; sub?: string } }) {
    const userId = req.user.id ?? req.user.sub;
    return this.referralService.generateReferralCode(userId!);
  }

  @Post('redeem')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apply a referral code to the current user account' })
  @ApiResponse({ status: 200, description: 'Referral redeemed' })
  @ApiResponse({ status: 404, description: 'Invalid referral code' })
  @ApiResponse({ status: 409, description: 'Already redeemed' })
  async redeem(
    @Req() req: { user: { id?: string; sub?: string } },
    @Body() dto: RedeemReferralDto,
  ) {
    const userId = req.user.id ?? req.user.sub;
    return this.referralService.redeemReferralCode(userId!, dto.referralCode);
  }

  @Get()
  @ApiOperation({ summary: 'List users referred by the current user' })
  async listMyReferrals(@Req() req: { user: { id?: string; sub?: string } }) {
    const userId = req.user.id ?? req.user.sub;
    return this.referralService.getMyReferrals(userId!);
  }
}
