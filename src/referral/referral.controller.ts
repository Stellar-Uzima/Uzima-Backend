import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ReferralService } from './referral.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RedeemReferralDto } from './dto/redeem-referral.dto';

@Controller('users/me')
@UseGuards(JwtAuthGuard)
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  @Get('referral-code')
  getReferralCode(@Req() req) {
    return this.referralService.getMyReferralCode(req.user.id);
  }

  @Get('referrals')
  getMyReferrals(@Req() req) {
    return this.referralService.getMyReferrals(req.user.id);
  }

  @Post('redeem-referral')
  redeemReferral(@Req() req, @Body() dto: RedeemReferralDto) {
    return this.referralService.redeemReferral(req.user.id, dto);
  }
}
