# Users Module

Manages user accounts, profiles, and user-related operations.

## Structure

```
users/
├── users.module.ts
├── users.controller.ts
├── users.service.ts
├── entities/
│   └── user.entity.ts         # User entity with all properties
├── dtos/
│   ├── create-user.dto.ts
│   ├── update-user.dto.ts
│   └── user-profile.dto.ts
└── README.md
```

## User Entity Properties

- id (UUID)
- email (unique)
- phone (unique, with country code)
- firstName
- lastName
- profileImage
- bio
- country
- language
- role (USER, ADMIN, HEALTH_WORKER)
- status (ACTIVE, INACTIVE, SUSPENDED)
- tasksCompleted (count)
- xLMEarned (decimal)
- createdAt
- updatedAt

## Tasks to Implement

- [ ] Create User entity and repository
- [ ] Get all users with pagination/filtering
- [ ] Get single user profile
- [ ] Update user profile
- [ ] Delete user account
- [ ] Get user statistics (tasks, earnings, streak)
- [ ] Search users (by name, email, phone)
- [ ] Block/Unblock users

## API Endpoints

- `GET /users` - List users (paginated)
- `GET /users/:id` - Get user details
- `PUT /users/:id` - Update user
- `DELETE /users/:id` - Delete user
- `GET /users/:id/profile` - Get full profile with stats
- `GET /users/search` - Search users

## Contributors

Add your name here when you start working on this module:
