import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RedeemReferralDto {
  @ApiProperty({
    description: 'The uppercase alphanumeric referral code to redeem',
    example: 'ABC123',
    minLength: 6,
    maxLength: 12,
  })
  @IsNotEmpty({ message: 'Referral code is required' })
  @IsString({ message: 'Referral code must be a string' })
  @Length(6, 12, { message: 'Referral code must be between 6 and 12 characters' })
  @Matches(/^[A-Z0-9]+$/, { message: 'Referral code must be uppercase alphanumeric' })
  referralCode: string;

  @ApiProperty({
    description: 'The ID of the user redeeming the referral code',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsNotEmpty({ message: 'User ID is required' })
  @IsString({ message: 'User ID must be a string' })
  userId: string;
}
