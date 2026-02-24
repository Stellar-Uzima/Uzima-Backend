# Health Tasks API Documentation

## Overview
CRUD endpoints for managing health tasks. Admins and healers can create tasks, while only admins can publish and delete them.

## Endpoints

### 1. Create Health Task
**POST** `/tasks`

**Authentication:** Required (JWT)  
**Authorization:** ADMIN or HEALER

**Request Body:**
```json
{
  "name": "Walk 10,000 steps",
  "description": "Walk at least 10,000 steps daily",
  "categoryId": 2,
  "xlmReward": 1.0
}
```

**Validation:**
- `name`: Required, max 255 characters
- `description`: Optional
- `categoryId`: Required, must be valid category ID
- `xlmReward`: Required, between 0.1 and 5.0

**Response:** 201 Created
```json
{
  "id": 1,
  "name": "Walk 10,000 steps",
  "description": "Walk at least 10,000 steps daily",
  "categoryId": 2,
  "xlmReward": 1.0,
  "status": "DRAFT",
  "createdBy": 5,
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

---

### 2. Get All Active Tasks
**GET** `/tasks`

**Authentication:** Not required (public)  
**Query Parameters:**
- `page` (optional): Page number, default 1
- `limit` (optional): Items per page, default 20, max 100
- `categoryId` (optional): Filter by category

**Example:** `/tasks?page=1&limit=20&categoryId=2`

**Response:** 200 OK
```json
{
  "data": [
    {
      "id": 1,
      "name": "Walk 10,000 steps",
      "description": "Walk at least 10,000 steps daily",
      "categoryId": 2,
      "xlmReward": 1.0,
      "status": "ACTIVE",
      "createdBy": 5,
      "creator": {
        "id": 5,
        "email": "healer@example.com"
      },
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 50,
    "totalPages": 3
  }
}
```

**Note:** Only returns tasks with `status = 'ACTIVE'`

---

### 3. Get Task by ID
**GET** `/tasks/:id`

**Authentication:** Not required (public)

**Response:** 200 OK
```json
{
  "id": 1,
  "name": "Walk 10,000 steps",
  "description": "Walk at least 10,000 steps daily",
  "categoryId": 2,
  "xlmReward": 1.0,
  "status": "ACTIVE",
  "createdBy": 5,
  "creator": {
    "id": 5,
    "email": "healer@example.com"
  },
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

**Error:** 404 Not Found if task doesn't exist

---

### 4. Update Task
**PATCH** `/tasks/:id`

**Authentication:** Required (JWT)  
**Authorization:** Task owner or ADMIN

**Request Body:** (all fields optional)
```json
{
  "name": "Walk 12,000 steps",
  "description": "Updated description",
  "categoryId": 2,
  "xlmReward": 1.2,
  "status": "ACTIVE"
}
```

**Important:**
- Only ADMIN can set `status` to `ACTIVE` (publish task)
- Task owner or ADMIN can update other fields
- `xlmReward` must be between 0.1 and 5.0 if provided

**Response:** 200 OK
```json
{
  "id": 1,
  "name": "Walk 12,000 steps",
  "description": "Updated description",
  "categoryId": 2,
  "xlmReward": 1.2,
  "status": "ACTIVE",
  "createdBy": 5,
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T11:00:00Z"
}
```

**Errors:**
- 403 Forbidden: Not owner or admin
- 403 Forbidden: Only admins can publish tasks
- 404 Not Found: Task doesn't exist

---

### 5. Delete Task (Soft Delete)
**DELETE** `/tasks/:id`

**Authentication:** Required (JWT)  
**Authorization:** ADMIN only

**Response:** 200 OK
```json
{
  "message": "Task archived successfully"
}
```

**Note:** This is a soft delete - sets `status` to `ARCHIVED`

**Errors:**
- 403 Forbidden: Not an admin
- 404 Not Found: Task doesn't exist

---

## Task Status Flow

1. **DRAFT** - Initial state when created by HEALER or ADMIN
2. **ACTIVE** - Published by ADMIN, visible in public GET /tasks
3. **ARCHIVED** - Soft deleted by ADMIN

## Categories

Available categories (seeded data):
1. Nutrition
2. Exercise
3. Mental Health
4. Maternal Health
5. Hygiene

## Database Schema

### health_tasks table
- `id`: Primary key
- `name`: varchar(255)
- `description`: text (nullable)
- `categoryId`: Foreign key to categories
- `xlmReward`: decimal(10,2)
- `status`: enum (DRAFT, ACTIVE, ARCHIVED)
- `createdBy`: Foreign key to users
- `createdAt`: timestamp
- `updatedAt`: timestamp

### categories table
- `id`: Primary key
- `name`: varchar(100)
