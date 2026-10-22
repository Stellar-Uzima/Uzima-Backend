import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReferralRiskReviewStatus } from '../referral-reward.constants';

export class ResolveReferralRiskReviewDto {
  @ApiProperty({ enum: [ReferralRiskReviewStatus.APPROVED, ReferralRiskReviewStatus.REJECTED] })
  @IsIn([ReferralRiskReviewStatus.APPROVED, ReferralRiskReviewStatus.REJECTED])
  decision: ReferralRiskReviewStatus.APPROVED | ReferralRiskReviewStatus.REJECTED;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
