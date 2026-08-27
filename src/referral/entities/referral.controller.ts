import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ReferralService } from './referral.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@ApiTags('referrals')
@ApiBearerAuth()
@Controller('users/me')
@UseGuards(JwtAuthGuard)
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  @Get('referral-code')
  @ApiOperation({ summary: 'Get the referral code for the current authenticated user' })
  @ApiResponse({ status: 200, description: 'Referral code retrieved successfully' })
  getReferralCode(@Req() req) {
    return this.referralService.getMyReferralCode(req.user.id);
  }

  @Get('referrals')
  @ApiOperation({ summary: 'Get the list of referrals made by the current authenticated user' })
  @ApiResponse({ status: 200, description: 'Referrals list retrieved successfully' })
  getMyReferrals(@Req() req) {
    return this.referralService.getMyReferrals(req.user.id);
  }
}
