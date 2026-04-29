import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
  HttpStatus,
} from '@nestjs/common';
import { validate, ValidationError } from 'class-validator';
import { plainToClass } from 'class-transformer';

@Injectable()
export class ValidationPipe implements PipeTransform<any> {
  async transform(value: any, metadata: ArgumentMetadata) {
    if (!value && !metadata.type) {
      return value;
    }

    const { metatype } = metadata;
    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }

    const object = plainToClass(metatype, value);
    const errors = await validate(object);

    if (errors.length > 0) {
      const formattedErrors = this.formatErrors(errors);
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Validation failed',
        errors: formattedErrors,
      });
    }

    return object;
  }

  private toValidate(metatype: Function): boolean {
    const types: Function[] = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }

  private formatErrors(errors: ValidationError[]): any {
    return errors.reduce((acc, error) => {
      const property = error.property;
      const constraints = error.constraints;

      if (constraints) {
        acc[property] = Object.values(constraints);
      }

      // Handle nested validation errors
      if (error.children && error.children.length > 0) {
        const nestedErrors = this.formatErrors(error.children);
        if (Object.keys(nestedErrors).length > 0) {
          acc[property] = acc[property] || [];
          acc[property].push(...Object.values(nestedErrors).flat());
        }
      }

      return acc;
    }, {});
  }
}

@Injectable()
export class CustomValidationPipe extends ValidationPipe {
  constructor() {
    super();
  }
}
