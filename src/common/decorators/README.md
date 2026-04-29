# Decorators

Custom NestJS decorators for common functionality.

## Usage

Place custom decorators here:
- `@Public()` - Skip authentication
- `@CurrentUser()` - Get current authenticated user
- `@Role()` - Role-based access control
- etc.

## Example

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```
