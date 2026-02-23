# Admin User Management API

## Overview

Admin endpoints for managing users, including listing, searching, role changes, and account suspension. All endpoints require ADMIN role authentication.

## Authentication

All endpoints require:

- Valid JWT token in Authorization header: `Bearer <token>`
- User must have `ADMIN` role

## Endpoints

### 1. List Users (Paginated with Filters)

```
GET /admin/users
```

Query all users with optional filters and pagination.

**Query Parameters:**

- `page` (optional, default: 1) - Page number
- `limit` (optional, default: 20, max: 100) - Items per page
- `country` (optional) - Filter by country code (e.g., "US")
- `role` (optional) - Filter by role: USER, HEALER, or ADMIN
- `isActive` (optional) - Filter by active status: true or false
- `search` (optional) - Search by name or email (case-insensitive)

**Example Request:**

```bash
curl -X GET "http://localhost:3000/admin/users?page=1&limit=20&role=HEALER&search=john" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Response:**

```json
{
  "data": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "email": "john@example.com",
      "name": "John Doe",
      "role": "HEALER",
      "country": "US",
      "isActive": true,
      "stellarWalletAddress": "GXXXXXXX...",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "meta": {
    "total": 50,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

---

### 2. Get User by ID

```
GET /admin/users/:id
```

Retrieve detailed information about a specific user.

**Path Parameters:**

- `id` (required) - User UUID

**Example Request:**

```bash
curl -X GET "http://localhost:3000/admin/users/123e4567-e89b-12d3-a456-426614174000" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Response:**

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "email": "john@example.com",
  "name": "John Doe",
  "role": "USER",
  "country": "US",
  "isActive": true,
  "stellarWalletAddress": null,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

**Error Responses:**

- `400 Bad Request` - User not found
- `401 Unauthorized` - Invalid or missing token
- `403 Forbidden` - User is not an admin

---

### 3. Change User Role

```
PATCH /admin/users/:id/role
```

Change a user's role. Admins cannot change their own role.

**Path Parameters:**

- `id` (required) - User UUID

**Request Body:**

```json
{
  "role": "HEALER"
}
```

**Valid Roles:**

- `USER`
- `HEALER`
- `ADMIN`

**Example Request:**

```bash
curl -X PATCH "http://localhost:3000/admin/users/123e4567-e89b-12d3-a456-426614174000/role" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role": "HEALER"}'
```

**Response:**

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "email": "john@example.com",
  "name": "John Doe",
  "role": "HEALER",
  "country": "US",
  "isActive": true,
  "stellarWalletAddress": null,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

**Error Responses:**

- `400 Bad Request` - User not found or invalid role
- `403 Forbidden` - Cannot change own role

**Audit Log:**
Action is logged: `"Changed role of user {userId} to {role}"`

---

### 4. Suspend User

```
PATCH /admin/users/:id/suspend
```

Suspend a user account. Sets `isActive` to false and invalidates all refresh tokens. Admins cannot suspend themselves.

**Path Parameters:**

- `id` (required) - User UUID

**Example Request:**

```bash
curl -X PATCH "http://localhost:3000/admin/users/123e4567-e89b-12d3-a456-426614174000/suspend" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Response:**

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "email": "john@example.com",
  "name": "John Doe",
  "role": "USER",
  "country": "US",
  "isActive": false,
  "stellarWalletAddress": null,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

**Error Responses:**

- `400 Bad Request` - User not found
- `403 Forbidden` - Cannot suspend own account

**Side Effects:**

- User's `isActive` flag set to `false`
- All refresh tokens invalidated in Redis
- User cannot log in until reactivated

**Audit Log:**
Action is logged: `"Suspended user {userId}"`

---

## Security Features

### Role-Based Access Control

- All endpoints protected by `JwtAuthGuard` and `RolesGuard`
- Only users with `ADMIN` role can access these endpoints
- Admins cannot modify their own role or suspend themselves

### Audit Logging

- All role changes and suspensions are logged to the audit log
- Logs include: admin ID, action description, and timestamp
- Audit logs stored in `audit_log` table

### Data Protection

- User passwords are never returned in API responses
- Only necessary user fields are selected from database
- Refresh tokens invalidated on suspension

---

## Testing

### 1. Get Admin Access Token

```bash
# Login as admin
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "admin_password"
  }'
```

### 2. List All Users

```bash
curl -X GET "http://localhost:3000/admin/users?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 3. Search for Users

```bash
# Search by name or email
curl -X GET "http://localhost:3000/admin/users?search=john" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Filter by role
curl -X GET "http://localhost:3000/admin/users?role=HEALER" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Filter by active status
curl -X GET "http://localhost:3000/admin/users?isActive=false" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 4. Change User Role

```bash
curl -X PATCH "http://localhost:3000/admin/users/USER_ID/role" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role": "HEALER"}'
```

### 5. Suspend User

```bash
curl -X PATCH "http://localhost:3000/admin/users/USER_ID/suspend" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Implementation Details

### Files Structure

```
src/admin/
├── admin.module.ts                    # Module configuration
├── admin-user.controller.ts           # Controller with endpoints
├── services/
│   └── admin-users.service.ts         # Business logic
└── dto/
    ├── list-users.dto.ts              # Query parameters for listing
    ├── change-role.dto.ts             # Role change request
    └── user-response.dto.ts           # User response schema

src/audit/
├── audit.module.ts                    # Audit module
├── audit.service.ts                   # Audit logging service
└── entities/
    └── audit-log.entity.ts            # Audit log entity
```

### Database Schema

**User Entity:**

- `id` (UUID, primary key)
- `email` (string, unique)
- `name` (string)
- `password` (string, hashed)
- `role` (enum: USER, HEALER, ADMIN)
- `country` (string, 2 chars)
- `isActive` (boolean, default: true)
- `stellarWalletAddress` (string, nullable, unique)
- `createdAt` (timestamp)
- `updatedAt` (timestamp)

**Audit Log Entity:**

- `id` (UUID, primary key)
- `adminId` (string)
- `action` (string)
- `createdAt` (timestamp)

---

## Error Handling

All endpoints return standard HTTP status codes:

- `200 OK` - Request successful
- `400 Bad Request` - Invalid input or user not found
- `401 Unauthorized` - Missing or invalid JWT token
- `403 Forbidden` - Insufficient permissions or self-modification attempt
- `500 Internal Server Error` - Server error

Error response format:

```json
{
  "statusCode": 403,
  "message": "You do not have permission (role required)",
  "error": "Forbidden"
}
```
