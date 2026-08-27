import { IsEmail, IsOptional, IsString, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    description: 'Registered email address for this account',
    example: 'jane.doe@example.com',
    format: 'email',
  })
  @IsEmail({}, { message: 'Invalid email format' })
  @IsString({ message: 'Email must be a string' })
  email: string;

  @ApiProperty({
    description: 'Account password (8-32 characters)',
    example: 'StrongP@ssw0rd!',
    minLength: 8,
    maxLength: 32,
  })
  @IsString({ message: 'Password must be a string' })
  @Length(8, 32, { message: 'Password must be between 8 and 32 characters' })
  password: string;

  @ApiPropertyOptional({ description: 'TOTP code when two-factor authentication is enabled' })
  @IsOptional()
  @IsString()
  @Length(6, 6)
  totpCode?: string;
}
