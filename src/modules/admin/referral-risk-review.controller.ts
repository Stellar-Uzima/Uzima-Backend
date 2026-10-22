import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@modules/auth/decorators/roles.decorator';
import { Role } from '@modules/auth/enums/role.enum';
import {
  ReferralRiskReviewStatus,
} from '@/referral/referral-reward.constants';
import { ReferralRewardSettlementService } from '@/referral/referral-reward-settlement.service';
import { ResolveReferralRiskReviewDto } from '@/referral/dto/resolve-referral-risk-review.dto';

class ListReferralRiskReviewsQueryDto {
  @IsOptional()
  @IsEnum(ReferralRiskReviewStatus)
  status?: ReferralRiskReviewStatus = ReferralRiskReviewStatus.PENDING;
}

@ApiTags('Admin - Referral Risk Reviews')
@ApiBearerAuth()
@ApiSecurity('bearer')
@Controller('admin/referrals/risk-reviews')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ReferralRiskReviewController {
  constructor(
    private readonly referralRewardSettlementService: ReferralRewardSettlementService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List referral risk reviews',
    description:
      'Defaults to pending reviews. Set status to inspect approved or rejected review history.',
  })
  @ApiResponse({ status: 200, description: 'Referral risk review records' })
  getReviews(
    @Query() query: ListReferralRiskReviewsQueryDto,
  ) {
    return this.referralRewardSettlementService.getReferralRiskReviews(
      query.status,
    );
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Approve or reject a referral risk review',
    description:
      'Approval releases the held reward through the normal idempotent settlement flow. Rejection permanently prevents settlement.',
  })
  @ApiResponse({ status: 200, description: 'Review decision recorded' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  @ApiResponse({ status: 409, description: 'Review already has a different decision' })
  resolveReview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveReferralRiskReviewDto,
    @Req() req: { user: { id: string } },
  ) {
    return this.referralRewardSettlementService.resolveReferralRiskReview(
      id,
      dto.decision,
      req.user.id,
      dto.note,
    );
  }
}
