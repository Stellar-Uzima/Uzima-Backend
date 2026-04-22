# Pipes

Data validation and transformation pipes.

## Files to Create

- `validation.pipe.ts` - Custom validation pipe
- `parse-id.pipe.ts` - Parse and validate ID parameters

## Example

```typescript
import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';

@Injectable()
export class ValidationPipe implements PipeTransform<any> {
  async transform(value: any, metadata: ArgumentMetadata) {
    if (!value) {
      throw new BadRequestException('Validation failed');
    }
    return value;
  }
}
```
