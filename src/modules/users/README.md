# Users Module

Manages user accounts, profiles, and user-related operations.

## Structure

```
users/
users.controller.ts                 # REST API endpoints with admin protection
users.service.ts                    # Business logic and database operations
dto/
  user-filter.dto.ts               # Pagination, filtering, and sorting options
README.md                          # This documentation
```

## User Entity Properties

- id (UUID)
- email (unique)
- phoneNumber (unique, with country code)
- country
- preferredLanguage
- firstName
- lastName
- fullName
- role (USER, HEALER, ADMIN)
- isActive (boolean)
- isVerified (boolean)
- walletAddress
- stellarWalletAddress
- dailyXlmEarned
- lastActiveAt
- createdAt
- updatedAt
- referralCode
- emailVerificationToken
- passwordResetToken

## Implemented Features

### GET /api/users - List Users (Admin Only)

**Endpoint**: `GET /api/users`

**Description**: Retrieve a paginated list of users with comprehensive filtering and sorting options. Requires admin role.

**Authentication**: Bearer token required
**Authorization**: Admin role required

#### Query Parameters

##### Pagination

- `page` (number, optional): Page number (default: 1, min: 1)
- `limit` (number, optional): Items per page (default: 10, min: 1, max: 100)

##### Sorting

- `sort` (array, optional): Array of sort objects
  - `field` (string): Field to sort by
  - `order` (string): Sort order ('ASC' or 'DESC')

  **Valid fields**: id, email, firstName, lastName, role, isActive, isVerified, createdAt, updatedAt, lastActiveAt, country, preferredLanguage, dailyXlmEarned

##### Filters

- `role` (enum): Filter by user role (USER, HEALER, ADMIN)
- `isActive` (boolean): Filter by active status
- `isVerified` (boolean): Filter by verification status
- `createdAtFrom` (string): Filter users created from this date (ISO 8601)
- `createdAtTo` (string): Filter users created up to this date (ISO 8601)
- `lastActiveFrom` (string): Filter users last active from this date (ISO 8601)
- `lastActiveTo` (string): Filter users last active up to this date (ISO 8601)
- `country` (string): Filter by country code
- `preferredLanguage` (string): Filter by preferred language
- `walletAddress` (string): Filter by wallet address (partial match)
- `stellarWalletAddress` (string): Filter by stellar wallet address (partial match)
- `referralCode` (string): Filter by referral code (partial match)
- `minDailyXlmEarned` (number): Filter by minimum daily XLM earned
- `maxDailyXlmEarned` (number): Filter by maximum daily XLM earned
- `phoneNumber` (string): Filter by phone number (partial match)
- `hasPasswordResetToken` (boolean): Filter users with/without password reset tokens
- `hasEmailVerificationToken` (boolean): Filter users with/without email verification tokens
- `search` (string): Search across email, firstName, lastName, and fullName

#### Response Format

```json
{
  "data": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": "USER",
      "isActive": true,
      "isVerified": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
      // ... other user fields
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "totalPages": 10,
    "hasNext": true,
    "hasPrev": false,
    "nextPage": 2,
    "prevPage": null
  }
}
```

#### Error Responses

- `401 Unauthorized`: Missing or invalid authentication token
- `403 Forbidden`: User does not have admin role

#### Example Usage

````bash
# Basic pagination
GET /api/users?page=1&limit=20

# Filter by role and status
GET /api/users?role=USER&isActive=true

# Date range filtering
GET /api/users?createdAtFrom=2024-01-01T00:00:00.000Z&createdAtTo=2024-12-31T23:59:59.999Z

# Search and sort
GET /api/users?search=john&sort[0][field]=createdAt&sort[0][order]=DESC

# Complex filtering
GET /api/users?role=USER&isActive=true&country=US&minDailyXlmEarned=10&sort[0][field]=dailyXlmEarned&sort[0][order]=DESC

## Other Endpoints (Admin Only)

- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user profile
- `DELETE /api/users/:id` - Delete user account
- `GET /api/users/:id/profile` - Get user profile with statistics

## Security Features

- **Role-based Access Control**: All endpoints require admin role
- **Double Validation**: Controller validates admin role in addition to guards
- **SQL Injection Prevention**: Sort field validation prevents malicious input
- **Input Validation**: Comprehensive DTO validation with class-validator

## Performance Considerations

- **Database Indexing**: Ensure indexes on frequently filtered fields (role, isActive, createdAt, etc.)
- **Pagination**: Efficient offset/limit pagination with total count
- **Query Optimization**: TypeORM query builder for optimal database queries
- **Field Filtering**: Only select necessary fields to reduce data transfer

## Testing

Comprehensive unit tests covering:
- Basic functionality with admin users
- Forbidden access for non-admin users
- Pagination and filtering
- Sorting with multiple fields
- Edge cases and error handling
- Security validation
- Performance scenarios

Run tests:
```bash
npm test -- src/modules/users/users.controller.spec.ts
````

## Implementation Details

### Service Layer

- `listUsers()`: Main method with pagination, filtering, and sorting
- `findOne()`: Get user by ID
- `findByEmail()`: Get user by email
- `findByPhone()`: Get user by phone
- `getUserStats()`: Get user statistics
- `isAdmin()`: Check if user has admin role

### DTOs

- `UserFilterDto`: Extends `PaginationDto` with user-specific filters
- `PaginationDto`: Reusable pagination and sorting DTO
- `PaginatedResponseDto<T>`: Generic paginated response format

### Database Queries

- TypeORM Query Builder for dynamic query construction
- Parameterized queries to prevent SQL injection
- Efficient count queries for pagination metadata
- ILIKE for case-insensitive search

## Future Enhancements

- [ ] Implement user profile update functionality
- [ ] Add user statistics calculation
- [ ] Implement user soft delete
- [ ] Add user activity logging
- [ ] Implement bulk user operations
- [ ] Add user export functionality (CSV/Excel)
- [ ] Implement advanced search with full-text search
- [ ] Add user analytics and reporting

## Contributors

- **Backend Team**: User management and API implementation
- **Security Team**: Role-based access control and validation
