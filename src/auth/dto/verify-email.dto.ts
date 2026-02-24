import { IsString, IsNotEmpty, IsUUID, IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailDto {
  @ApiProperty({
    description: 'The verification token sent to the user\'s email',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
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
