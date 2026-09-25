import { IsEmail, IsOptional, IsString, Length, MaxLength, Transform } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, normalizeEmail } from '../services/credential-normalizer';

export class LoginDto {
  @ApiProperty({
    description: 'Registered email address for this account',
    example: 'jane.doe@example.com',
    format: 'email',
  })
  @Transform(({ value }) => (typeof value === 'string' ? normalizeEmail(value) : value))
  @IsEmail({}, { message: 'Invalid email format' })
  @IsString({ message: 'Email must be a string' })
  email: string;

  @ApiProperty({
    description:
      'Account password. The bounds match registration exactly: a limit enforced only at ' +
      'registration and not here would permanently lock out any user who chose a longer password.',
    example: 'StrongP@ssw0rd!',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
  })
  @IsString({ message: 'Password must be a string' })
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, {
    message: `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters`,
  })
  // bcrypt truncates past 72 bytes, so an over-long password must not reach the
  // comparison: the tail would be ignored and the verdict would be meaningless.
  @MaxLength(PASSWORD_MAX_LENGTH, {
    message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
  })
  password: string;

  @ApiPropertyOptional({ description: 'TOTP code when two-factor authentication is enabled' })
  @IsOptional()
  @IsString()
  @Length(6, 6)
  totpCode?: string;
}
