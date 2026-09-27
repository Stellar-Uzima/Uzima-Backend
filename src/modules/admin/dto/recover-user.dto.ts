import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RecoverUserDto {
  @ApiPropertyOptional({ description: 'Existing verified email used to validate account identity' })
  @IsOptional()
  @IsEmail()
  identityEmail?: string;

  @ApiPropertyOptional({
    description: 'Existing verified phone number used to validate account identity',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  identityPhoneNumber?: string;

  @ApiPropertyOptional({ description: 'Corrected email address' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Corrected phone number in international format' })
  @IsOptional()
  @Matches(/^\+?[1-9]\d{6,14}$/)
  phoneNumber?: string;

  @ApiProperty({ description: 'Reason for the admin-assisted recovery or identity correction' })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason: string;
}
