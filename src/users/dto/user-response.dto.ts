import { Exclude, Expose, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

@Exclude()
export class UserResponseDto {
  @Expose()
  @ApiProperty({ description: 'User unique identifier', example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @Expose()
  @ApiProperty({ description: 'User full name', example: 'John Doe' })
  fullName: string;

  @Expose()
  @ApiProperty({ description: 'User email address', example: 'user@example.com' })
  email: string;

  @Expose()
  @ApiProperty({ description: 'User country code (ISO 3166-1 alpha-2)', example: 'US' })
  country: string;

  @Expose()
  @ApiProperty({ description: 'User preferred language code', example: 'en' })
  preferredLanguage: string;

  @Expose()
  @ApiProperty({ description: 'User Stellar wallet address', nullable: true })
  stellarWalletAddress: string | null;

  @Expose()
  @ApiProperty({ description: 'User role', example: 'USER' })
  role: string;

  @Expose()
  @ApiProperty({ description: 'Whether the user account is verified', example: true })
  isVerified: boolean;

  @Expose()
  @ApiProperty({ description: 'Account creation timestamp', example: '2024-01-15T10:30:00.000Z' })
  createdAt: Date;
}
