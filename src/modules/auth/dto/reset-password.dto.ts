import { IsEmail, IsNotEmpty, IsString, Length, MaxLength, Transform } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsStrongPassword } from '../decorators/strong-password.decorator';
import {
  BCRYPT_MAX_PASSWORD_BYTES,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  normalizeEmail,
} from '../services/credential-normalizer';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@example.com' })
  @Transform(({ value }) => (typeof value === 'string' ? normalizeEmail(value) : value))
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'The token received in email' })
  @IsString()
  @IsNotEmpty()
  @Length(32, 512, { message: 'token is malformed' })
  token: string;

  @ApiProperty({
    description:
      'The new password. Subject to the same policy as registration, including the 72-byte ' +
      'bcrypt ceiling.',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, {
    message: `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters`,
  })
  @MaxLength(PASSWORD_MAX_LENGTH, {
    message: `Password must be at most ${BCRYPT_MAX_PASSWORD_BYTES} bytes`,
  })
  @IsStrongPassword({ message: 'Password does not meet the security policy' })
  password: string;
}
