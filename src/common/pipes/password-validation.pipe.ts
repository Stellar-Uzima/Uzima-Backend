import {
  PipeTransform,
  Injectable,
  BadRequestException,
  HttpStatus,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PasswordValidationConfig,
  resolvePasswordValidationConfig,
} from '../../config/password.config';

const SPECIAL_CHAR_PATTERN = /[^\da-zA-Z]/;

export function validatePasswordStrength(
  password: string,
  config: PasswordValidationConfig,
): string[] {
  const errors: string[] = [];

  if (password.length < config.minLength) {
    errors.push(
      `Password must be at least ${config.minLength} characters long`,
    );
  }

  if (password.length > config.maxLength) {
    errors.push(
      `Password must be at most ${config.maxLength} characters long`,
    );
  }

  if (config.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (config.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (config.requireNumbers && !/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (config.requireSpecialChars && !SPECIAL_CHAR_PATTERN.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return errors;
}

@Injectable()
export class PasswordValidationPipe implements PipeTransform {
  private readonly passwordField = 'password';

  constructor(
    @Optional() private readonly configService?: ConfigService,
  ) {}

  transform(value: unknown): unknown {
    if (value === null || value === undefined || typeof value !== 'object') {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Validation failed',
        errors: {
          [this.passwordField]: ['Request body must be a valid object'],
        },
      });
    }

    const body = value as Record<string, unknown>;
    const password = body[this.passwordField];

    if (password === undefined || password === null) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Validation failed',
        errors: {
          [this.passwordField]: ['Password is required'],
        },
      });
    }

    if (typeof password !== 'string') {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Validation failed',
        errors: {
          [this.passwordField]: ['Password must be a string'],
        },
      });
    }

    const config = resolvePasswordValidationConfig(this.configService);
    const errors = validatePasswordStrength(password, config);

    if (errors.length > 0) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Validation failed',
        errors: {
          [this.passwordField]: errors,
        },
      });
    }

    return value;
  }
}
