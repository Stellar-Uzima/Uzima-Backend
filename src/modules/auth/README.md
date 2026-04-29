# Auth Module

Handles user authentication and authorization.

## Structure

```
auth/
├── auth.module.ts
├── auth.controller.ts
├── auth.service.ts
├── dtos/              # Auth-specific DTOs (register, login, token)
├── strategies/        # Passport strategies (jwt, local)
├── entities/          # (if needed)
└── README.md
```

## Tasks to Implement

- [ ] User Registration (email/phone verification)
- [ ] User Login (credential validation)
- [ ] JWT Token Generation
- [ ] Token Refresh
- [ ] Password Reset
- [ ] Email/Phone Verification
- [ ] Social Authentication (optional)

## API Endpoints

- `POST /auth/register` - Register new user
- `POST /auth/login` - Login user
- `POST /auth/refresh` - Refresh token
- `POST /auth/logout` - Logout
- `POST /auth/forgot-password` - Initiate password reset
- `POST /auth/verify-email` - Verify email address

## Contributors

Add your name here when you start working on this module:
