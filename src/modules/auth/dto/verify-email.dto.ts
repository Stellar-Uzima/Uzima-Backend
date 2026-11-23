import { IsString, IsNotEmpty, IsEmail, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailDto {
  @ApiProperty({
    description: "The verification token sent to the user's email (64 lowercase hex characters)",
    example: 'a3f1c9d2e47b58a60f1d3c2b9e8a7f6054d3c2b1a09f8e7d6c5b4a39281706f5',
  })
  @IsString()
  @IsNotEmpty()
  // Tokens are 32 random bytes written as hex (see EmailVerificationService).
  // This used to demand a UUID, which no issued token ever is, so every real
  // verification link was rejected before it reached the service.
  @Matches(/^[a-f0-9]{64}$/, { message: 'Verification token is malformed' })
  token: string;
}

export class ResendEmailVerificationDto {
  @ApiProperty({
    description: 'Email address to resend verification token',
    example: 'user@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
