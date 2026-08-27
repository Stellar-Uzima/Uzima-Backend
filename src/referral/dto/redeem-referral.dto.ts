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
}
