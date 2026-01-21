# Swagger API Documentation

## Summary
This PR implements interactive API documentation using Swagger UI and OpenAPI 3.0 specification.

## Demo

https://github.com/user-attachments/assets/swagger-demo.webp

> **Note**: Upload the video file `docs/swagger-demo.webp` to GitHub when creating the PR

## Changes Made

### Configuration
- **src/config/swagger.js**: Enhanced with complete OpenAPI info, 10 API tags, and reusable schemas
- **src/index.js**: Changed docs path from `/docs` to `/api-docs`, added JSON spec endpoint

### Route Documentation Added
| Route | Endpoints |
|-------|-----------|
| authRoutes.js | 14 endpoints (register, login, 2FA, password reset) |
| prescriptionRoutes.js | 5 endpoints (create, verify, reject, list) |
| inventoryRoutes.js | 6 endpoints (CRUD, lots, consume) |
| notificationRoutes.js | 5 endpoints (email operations) |

## Acceptance Criteria

- [x] All endpoints documented
- [x] Interactive Swagger UI accessible at `/api-docs`
- [x] Examples provided for requests
- [x] Authentication documented (Bearer JWT)
- [x] Error responses documented

## How to Test

```bash
npm install
npm start
# Visit http://localhost:5000/api-docs
```

## Screenshots

![Swagger UI Tags](docs/swagger-demo.webp)
