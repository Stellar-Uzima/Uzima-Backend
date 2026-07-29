import {
  Injectable,
  BadRequestException,
  HttpStatus,
  ValidationPipe as NestValidationPipe,
  ValidationError,
} from '@nestjs/common';

/**
 * Formats validation errors into a nested record of property → messages.
 */
function formatNestedErrors(errors: ValidationError[]): Record<string, string[]> {
  return errors.reduce((acc, error) => {
    const property = error.property;
    const constraints = error.constraints;

    if (constraints) {
      acc[property] = Object.values(constraints);
    }

    if (error.children && error.children.length > 0) {
      const nested = formatNestedErrors(error.children);
      if (Object.keys(nested).length > 0) {
        acc[property] = acc[property] || [];
        acc[property].push(...Object.values(nested).flat());
      }
    }

    return acc;
  }, {} as Record<string, string[]>);
}

/**
 * Global validation pipe that leverages NestJS's built-in ValidationPipe
 * with whitelist, transform, and custom error formatting.
 *
 * - `whitelist: true` — strips unknown properties from payloads
 * - `forbidNonWhitelisted: true` — throws if unknown properties are present
 * - `transform: true` — auto-transforms payloads to typed DTO instances
 */
@Injectable()
export class CustomValidationPipe extends NestValidationPipe {
  constructor() {
    super({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors: ValidationError[]) => {
        const formattedErrors = formatNestedErrors(errors);
        return new BadRequestException({
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Validation failed',
          errors: formattedErrors,
        });
      },
    });
  }
}
