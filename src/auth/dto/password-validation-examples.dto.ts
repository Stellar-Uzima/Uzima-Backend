import { IsEmail, IsString } from 'class-validator';
import { IsStrongPassword, HasMinPasswordStrength, IsStrongPasswordCategory } from '../decorators/strong-password.decorator';

/**
 * Example DTO showing how to use the password validation decorators
 */
export class RegisterUserDto {
  @IsEmail()
  email: string;

  @IsString()
  username: string;

  // Basic strong password validation with default requirements
  @IsStrongPassword({
    message: 'Password must be at least 8 characters long and contain uppercase, lowercase, number, and special character'
  })
  password: string;
}

/**
 * Example DTO with custom password requirements
 */
export class RegisterAdminDto {
  @IsEmail()
  email: string;

  @IsString()
  username: string;

  // Custom password requirements for admin users
  @IsStrongPassword({
    minLength: 12,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    message: 'Admin password must be at least 12 characters long with all character types'
  })
  @HasMinPasswordStrength(80, {
    message: 'Admin password strength score must be at least 80'
  })
  password: string;
}

/**
 * Example DTO with password category validation
 */
export class HighSecurityUserDto {
  @IsEmail()
  email: string;

  @IsString()
  username: string;

  // Require strong or very strong passwords
  @IsStrongPasswordCategory(['strong', 'very_strong'], {
    message: 'Password must be strong or very strong'
  })
  password: string;
}
