import { IsEmail, IsString, Length } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Invalid email format' })
  @IsString({ message: 'Email must be a string' })
  email: string;

  @IsString({ message: 'Password must be a string' })
  @Length(8, 32, { message: 'Password must be between 8 and 32 characters' })
  password: string;
}
