import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class RedeemReferralDto {
  @ApiProperty({ example: 'ABC12XYZ', description: 'Referral code from inviter' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 12)
  referralCode: string;
}
