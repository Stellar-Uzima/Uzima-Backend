# Role-Based Access Control (RBAC) Implementation

## Overview

This project implements role-based access control using NestJS guards and decorators to restrict endpoints based on user roles.

## Components

### 1. Role Enum (`src/auth/enums/role.enum.ts` & `src/users/enums/role.enum.ts`)

```typescript
export enum Role {
  USER = 'USER',
  HEALER = 'HEALER',
  ADMIN = 'ADMIN',
}
```

### 2. Roles Decorator (`src/auth/decorators/roles.decorator.ts`)

```typescript
import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
```

### 3. RolesGuard (`src/auth/guards/roles.guard.ts`)

- Reads required roles from decorator metadata using Reflector
- Extracts user role from JWT payload (via `request.user`)
- Throws `ForbiddenException` if user doesn't have required role
- Returns `true` if no roles are required or user has matching role

### 4. JWT Strategy (`src/auth/strategies/jwt.strategy.ts`)

Updated to include `role` in the validated user object:

```typescript
async validate(payload: any) {
  return { sub: payload.sub, email: payload.email, role: payload.role };
}
```

## Usage

### Controller-Level Protection

Apply guards and roles to entire controller:

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  // All endpoints require ADMIN role
}
```

### Method-Level Protection

Apply guards at controller level, roles at method level:

```typescript
@Controller('healer')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HealerController {
  @Get('dashboard')
  @Roles(Role.HEALER, Role.ADMIN)
  getDashboard() {
    return { message: 'Welcome healer or admin' };
  }

  @Get('admin-only')
  @Roles(Role.ADMIN)
  getAdmin() {
    return { message: 'Admin only endpoint' };
  }
}
```

### Multiple Roles

Allow multiple roles to access an endpoint:

```typescript
@Get('shared')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.HEALER, Role.ADMIN)
getShared() {
  return { message: 'Accessible by HEALER or ADMIN' };
}
```

## Guard Order

Always use guards in this order:

1. `JwtAuthGuard` - Validates JWT and populates `request.user`
2. `RolesGuard` - Checks role from `request.user`

```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
```

## How It Works

1. User logs in via `/auth/login`
2. Auth service generates JWT with payload: `{ sub, email, role }`
3. JWT strategy validates token and returns user object with role
4. `JwtAuthGuard` attaches user to request
5. `RolesGuard` checks if user's role matches required roles
6. If authorized, request proceeds; otherwise, `ForbiddenException` is thrown

## Testing

### Get Access Token

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}'
```

### Access Protected Endpoint

```bash
curl -X GET http://localhost:3000/admin \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Expected Responses

- Valid role: 200 OK with response data
- Invalid/missing role: 403 Forbidden
- Invalid/missing token: 401 Unauthorized

## Examples in Codebase

- `src/admin/admin.controller.ts` - ADMIN-only endpoints
- `src/auth/healer.controller.ts` - HEALER and ADMIN endpoints
