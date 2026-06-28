# Guards

Authentication and authorization guards.

## Files to Create

- `jwt.guard.ts` - JWT authentication guard
- `roles.guard.ts` - Role-based access guard
- `optional-jwt.guard.ts` - Optional JWT authentication

## Example

```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtGuard extends AuthGuard('jwt') {}
```

## Usage

```typescript
@UseGuards(JwtGuard)
@Controller('protected')
export class ProtectedController {
  // Routes here require JWT authentication
}
```
