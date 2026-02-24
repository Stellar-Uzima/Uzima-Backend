import { IsEmail, IsString, IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
    @ApiProperty({ example: 'user@example.com' })
    @IsEmail()
    @IsNotEmpty()
    email: string;
}

export class ResetPasswordDto {
    @ApiProperty({ description: 'The token received in email' })
    @IsString()
    @IsNotEmpty()
    token: string;

    @ApiProperty({ minLength: 8 })
    @IsString()
    @IsNotEmpty()
    @MinLength(8)
    password: string;
}
