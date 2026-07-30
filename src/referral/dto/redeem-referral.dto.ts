<<<<<<< HEAD
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class RedeemReferralDto {
  @ApiProperty({ example: 'ABC12XYZ', description: 'Referral code from inviter' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 12)
  referralCode: string;
=======
import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class RedeemReferralDto {
  @IsNotEmpty({ message: 'Referral code is required' })
  @IsString({ message: 'Referral code must be a string' })
  @Length(6, 12, { message: 'Referral code must be between 6 and 12 characters' })
  @Matches(/^[A-Z0-9]+$/, { message: 'Referral code must be uppercase alphanumeric' })
  referralCode: string;

  @IsNotEmpty({ message: 'User ID is required' })
  @IsString({ message: 'User ID must be a string' })
  userId: string;
>>>>>>> fea048b (feat(backend): consolidate referral module and add test coverage for referral, streaks & webhook verifier (closes #1055, #1056, #1057, #1061))
}
