import { IsUUID, IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailDto {
  @ApiProperty({
    description: 'Email verification token sent to user',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  token: string;
}

export class ResendEmailVerificationDto {
  @ApiProperty({
    description: 'Email address to resend verification token',
    example: 'user@example.com',
  })
  @IsEmail()
  email: string;
}
