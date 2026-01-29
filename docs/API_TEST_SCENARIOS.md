# API Test Scenarios - Uzima Healthcare Platform

Detailed documentation of all test scenarios in the Postman collection.

## Authentication Test Scenarios

### Scenario 1: User Registration

**Test Case**: Register User
**Endpoint**: `POST /api/auth/register`
**Role**: Public (no authentication required)

**Request Body**:
```json
{
  "username": "testuser_12345",
  "email": "test12345@uzima.local",
  "password": "TestPass@123",
  "role": "patient"
}
```

**Expected Response** (201):
```json
{
  "success": true,
  "message": "User registered successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "email": "test12345@uzima.local",
    "role": "patient",
    "username": "testuser_12345"
  }
}
```

**Test Assertions**:
- ✅ Status code is 201 (Created)
- ✅ Response contains JWT token
- ✅ Token is valid JWT format (length > 20)
- ✅ Response contains user object with required fields
- ✅ User role matches registration role
- ✅ Email is lowercase in response

**Error Cases**:
- 400: Duplicate email (user exists)
- 400: Invalid password (too weak)
- 400: Missing required fields

---

### Scenario 2: User Login (Happy Path)

**Test Case**: Login User
**Endpoint**: `POST /api/auth/login`
**Role**: Public (no authentication required)

**Request Body**:
```json
{
  "email": "patient.test@uzima.local",
  "password": "PatientTest@123"
}
```

**Expected Response** (200):
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "507f1f77bcf86cd799439012",
    "email": "patient.test@uzima.local",
    "role": "patient"
  }
}
```

**Test Assertions**:
- ✅ Status code is 200 (OK)
- ✅ Response contains JWT token
- ✅ Token is stored in environment: `pm.environment.set("patientToken", token)`
- ✅ User role is in response
- ✅ Response structure valid

**Data Cleanup**:
- Token used for subsequent authenticated tests
- Can be refreshed via refresh-token endpoint

---

### Scenario 3: Login with Invalid Credentials

**Test Case**: Login Invalid Credentials
**Endpoint**: `POST /api/auth/login`
**Role**: Public

**Request Body**:
```json
{
  "email": "nonexistent@uzima.local",
  "password": "WrongPassword123"
}
```

**Expected Response** (401):
```json
{
  "success": false,
  "message": "Invalid email or password"
}
```

**Test Assertions**:
- ✅ Status code is 401 (Unauthorized)
- ✅ Error message includes 'invalid'
- ✅ No token in response
- ✅ No user data returned

---

### Scenario 4: Token Refresh

**Test Case**: Refresh Token
**Endpoint**: `POST /api/auth/refresh-token`
**Authentication**: Bearer token required

**Request Headers**:
```
Authorization: Bearer {{patientToken}}
Content-Type: application/json
```

**Request Body**:
```json
{}
```

**Expected Response** (200):
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "7d"
}
```

**Test Assertions**:
- ✅ Status code is 200
- ✅ New token returned
- ✅ New token differs from old token
- ✅ Expiry time in response

**Use Case**: Extending session without re-login

---

### Scenario 5: Password Strength Check

**Test Case**: Password Strength Check
**Endpoint**: `POST /api/auth/password/strength`
**Role**: Public (no auth required)

**Request Body** (Strong Password):
```json
{
  "password": "StrongP@ssw0rd2024!"
}
```

**Expected Response** (200):
```json
{
  "success": true,
  "strength": 4,
  "feedback": {
    "score": 4,
    "suggestions": []
  }
}
```

**Test Assertions**:
- ✅ Status code is 200
- ✅ Strength score is number between 0-4
- ✅ Score 4 = very strong
- ✅ No suggestions for strong password

**Strength Scale**:
- 0: Too weak (no uppercase, no numbers, etc.)
- 1: Weak (missing some requirements)
- 2: Fair (meets minimum requirements)
- 3: Good (strong, no common patterns)
- 4: Very strong (exceeds all requirements)

---

## User Management Test Scenarios

### Scenario 6: List All Users (Admin Only)

**Test Case**: List All Users
**Endpoint**: `GET /api/users`
**Authentication**: Bearer token (admin role)
**Role Requirement**: admin

**Request Headers**:
```
Authorization: Bearer {{adminToken}}
```

**Expected Response** (200):
```json
[
  {
    "_id": "507f1f77bcf86cd799439011",
    "email": "admin.test@uzima.local",
    "role": "admin",
    "username": "admin_test",
    "createdAt": "2026-01-28T00:00:00Z"
  },
  {
    "_id": "507f1f77bcf86cd799439012",
    "email": "patient.test@uzima.local",
    "role": "patient",
    "username": "patient_test",
    "createdAt": "2026-01-28T00:01:00Z"
  }
]
```

**Test Assertions**:
- ✅ Status code is 200
- ✅ Response is array of users
- ✅ Each user has required fields (_id, email, role)
- ✅ No password hashes in response

---

### Scenario 7: Non-Admin Cannot List Users

**Test Case**: Patient Cannot Access Users Endpoint
**Endpoint**: `GET /api/users`
**Authentication**: Bearer token (patient role)
**Role Requirement**: admin

**Request Headers**:
```
Authorization: Bearer {{patientToken}}
```

**Expected Response** (403):
```json
{
  "success": false,
  "message": "Forbidden: Insufficient permissions"
}
```

**Test Assertions**:
- ✅ Status code is 403 (Forbidden)
- ✅ Error message indicates permission denied
- ✅ No user data returned

**RBAC Verification**: Patient role cannot access admin endpoints

---

### Scenario 8: Get User by ID

**Test Case**: Get User by ID
**Endpoint**: `GET /api/users/{id}`
**Authentication**: Bearer token

**Request URL**:
```
GET http://localhost:5000/api/users/{{testUserId}}
```

**Request Headers**:
```
Authorization: Bearer {{patientToken}}
```

**Expected Response** (200):
```json
{
  "_id": "507f1f77bcf86cd799439012",
  "email": "patient.test@uzima.local",
  "role": "patient",
  "username": "patient_test",
  "profile": {
    "firstName": "Test",
    "lastName": "Patient",
    "phone": "+1234567890"
  }
}
```

**Test Assertions**:
- ✅ Status code is 200
- ✅ User ID matches request parameter
- ✅ All profile fields present
- ✅ No sensitive data (no password)

---

## Medical Records Test Scenarios

### Scenario 9: Create Medical Record (Doctor Only)

**Test Case**: Create Medical Record
**Endpoint**: `POST /api/records`
**Authentication**: Bearer token (doctor role)
**Role Requirement**: doctor

**Request Headers**:
```
Authorization: Bearer {{doctorToken}}
Content-Type: application/json
```

**Request Body**:
```json
{
  "title": "Patient Checkup - 2026-01-28T10:00:00Z",
  "description": "Routine checkup and vital signs assessment",
  "recordType": "general",
  "notes": "Patient in good health"
}
```

**Expected Response** (201):
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439020",
    "title": "Patient Checkup - 2026-01-28T10:00:00Z",
    "description": "Routine checkup and vital signs assessment",
    "recordType": "general",
    "notes": "Patient in good health",
    "createdBy": "507f1f77bcf86cd799439011",
    "createdAt": "2026-01-28T10:00:00Z"
  }
}
```

**Test Assertions**:
- ✅ Status code is 201 (Created)
- ✅ Response contains record _id
- ✅ Record ID stored in environment: `pm.environment.set("testRecordId", _id)`
- ✅ Title matches request
- ✅ Created timestamp present

---

### Scenario 10: List Medical Records

**Test Case**: List Medical Records
**Endpoint**: `GET /api/records`
**Authentication**: Bearer token (doctor)
**Query Params**: Optional pagination (skip, limit)

**Request URL**:
```
GET http://localhost:5000/api/records?skip=0&limit=10
```

**Expected Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439020",
      "title": "Patient Checkup",
      "createdAt": "2026-01-28T10:00:00Z"
    }
  ],
  "pagination": {
    "skip": 0,
    "limit": 10,
    "total": 25
  }
}
```

**Test Assertions**:
- ✅ Status code is 200
- ✅ Response contains array
- ✅ Pagination metadata present (total count)
- ✅ Records sorted by created date (descending)

---

### Scenario 11: Get Record by ID

**Test Case**: Get Record by ID
**Endpoint**: `GET /api/records/{id}`
**Authentication**: Bearer token

**Request URL**:
```
GET http://localhost:5000/api/records/{{testRecordId}}
```

**Expected Response** (200):
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439020",
    "title": "Patient Checkup",
    "description": "Routine checkup...",
    "recordType": "general",
    "notes": "Patient in good health",
    "attachments": [],
    "createdAt": "2026-01-28T10:00:00Z",
    "updatedAt": "2026-01-28T10:00:00Z"
  }
}
```

**Test Assertions**:
- ✅ Status code is 200
- ✅ Record ID matches request parameter
- ✅ All record fields present
- ✅ Attachment array (may be empty)

**Error Cases**:
- 404: Record not found (invalid ID)
- 403: Access denied (not owner and not admin)

---

## Prescription Test Scenarios

### Scenario 12: Create Prescription (Doctor Only)

**Test Case**: Create Prescription
**Endpoint**: `POST /api/prescriptions`
**Authentication**: Bearer token (doctor role)

**Request Headers**:
```
Authorization: Bearer {{doctorToken}}
Content-Type: application/json
```

**Request Body**:
```json
{
  "patientId": "{{testUserId}}",
  "medications": [
    {
      "name": "Amoxicillin",
      "dosage": "500mg",
      "frequency": "twice daily",
      "duration": "7 days"
    },
    {
      "name": "Paracetamol",
      "dosage": "500mg",
      "frequency": "as needed",
      "duration": "14 days"
    }
  ],
  "notes": "Take medication with food"
}
```

**Expected Response** (201):
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439030",
    "patientId": "507f1f77bcf86cd799439012",
    "medications": [
      {
        "name": "Amoxicillin",
        "dosage": "500mg",
        "frequency": "twice daily",
        "duration": "7 days"
      },
      {
        "name": "Paracetamol",
        "dosage": "500mg",
        "frequency": "as needed",
        "duration": "14 days"
      }
    ],
    "notes": "Take medication with food",
    "status": "active",
    "createdAt": "2026-01-28T10:00:00Z"
  }
}
```

**Test Assertions**:
- ✅ Status code is 201
- ✅ Prescription _id generated
- ✅ Medications array has correct structure
- ✅ Status defaults to "active"
- ✅ ID stored: `pm.environment.set("testPrescriptionId", _id)`

---

### Scenario 13: Patient Cannot Create Prescription

**Test Case**: Patient Cannot Create Prescription
**Endpoint**: `POST /api/prescriptions`
**Authentication**: Bearer token (patient role)

**Request Headers**:
```
Authorization: Bearer {{patientToken}}
Content-Type: application/json
```

**Expected Response** (403):
```json
{
  "success": false,
  "message": "Forbidden: Insufficient permissions"
}
```

**Test Assertions**:
- ✅ Status code is 403
- ✅ Error message indicates forbidden
- ✅ Patient role verified as insufficient

---

## Inventory Management Test Scenarios

### Scenario 14: Create Inventory Item

**Test Case**: Create Inventory Item
**Endpoint**: `POST /api/inventory`
**Authentication**: Bearer token (admin role)

**Request Headers**:
```
Authorization: Bearer {{adminToken}}
Content-Type: application/json
```

**Request Body**:
```json
{
  "sku": "INV-12345-1706414400000",
  "name": "Test Medication",
  "category": "medication",
  "unit": "box",
  "threshold": 10,
  "lots": [
    {
      "lotNumber": "LOT-2026-001",
      "quantity": 100,
      "expiryDate": "2027-12-31T23:59:59Z"
    }
  ]
}
```

**Expected Response** (201):
```json
{
  "success": true,
  "data": {
    "sku": "INV-12345-1706414400000",
    "name": "Test Medication",
    "category": "medication",
    "unit": "box",
    "threshold": 10,
    "totalQuantity": 100,
    "lots": [
      {
        "lotNumber": "LOT-2026-001",
        "quantity": 100,
        "expiryDate": "2027-12-31T23:59:59Z"
      }
    ],
    "createdAt": "2026-01-28T10:00:00Z"
  }
}
```

**Test Assertions**:
- ✅ Status code is 201
- ✅ totalQuantity = sum of lot quantities
- ✅ SKU stored in environment: `pm.environment.set("testInventorySKU", sku)`
- ✅ Lot array preserved

---

### Scenario 15: Consume Stock (FIFO)

**Test Case**: Consume Stock
**Endpoint**: `POST /api/inventory/{sku}/consume`
**Authentication**: Bearer token

**Request URL**:
```
POST http://localhost:5000/api/inventory/{{testInventorySKU}}/consume
```

**Request Body**:
```json
{
  "quantity": 10
}
```

**Expected Response** (200):
```json
{
  "success": true,
  "data": {
    "sku": "INV-12345-1706414400000",
    "totalQuantity": 90,
    "lotsConsumed": [
      {
        "lotNumber": "LOT-2026-001",
        "quantityConsumed": 10
      }
    ]
  }
}
```

**Test Assertions**:
- ✅ Status code is 200
- ✅ totalQuantity decreased by 10 (from 100 to 90)
- ✅ FIFO consumption from earliest expiry lot
- ✅ lotsConsumed array shows which lots used

**FIFO Behavior**:
- Tracks consumed lots
- Prioritizes earliest expiryDate
- Prevents expired stock usage
- Maintains audit trail

---

## Payment Test Scenarios

### Scenario 16: Initialize Payment

**Test Case**: Initialize Payment
**Endpoint**: `POST /api/payments/initialize`
**Authentication**: Bearer token (any authenticated user)

**Request Headers**:
```
Authorization: Bearer {{patientToken}}
Content-Type: application/json
```

**Request Body**:
```json
{
  "provider": "stripe",
  "amount": 99.99,
  "currency": "USD",
  "type": "one-time",
  "metadata": {
    "description": "Test payment for API testing"
  }
}
```

**Expected Response** (200):
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439040",
    "userId": "507f1f77bcf86cd799439012",
    "provider": "stripe",
    "amount": 99.99,
    "currency": "USD",
    "type": "one-time",
    "status": "pending",
    "paymentUrl": "https://checkout.stripe.com/pay/cs_...",
    "createdAt": "2026-01-28T10:00:00Z"
  }
}
```

**Test Assertions**:
- ✅ Status code is 200
- ✅ Payment _id generated
- ✅ Status is "pending"
- ✅ paymentUrl provided (for checkout)
- ✅ Amount matches request

**Provider Support**:
- Stripe (currency: USD)
- Flutterwave (currency: NGN)

---

## Authorization & RBAC Test Scenarios

### Scenario 17: Missing Authentication Token

**Test Case**: Missing Token Returns 401
**Endpoint**: Any protected endpoint (e.g., `GET /api/users/{id}`)
**Authentication**: None (no Authorization header)

**Request Headers**:
```
(no Authorization header)
```

**Expected Response** (401):
```json
{
  "success": false,
  "message": "Unauthorized"
}
```

**Test Assertions**:
- ✅ Status code is 401
- ✅ Error message indicates unauthorized
- ✅ No data returned
- ✅ All protected endpoints require token

---

### Scenario 18: Invalid Token Format

**Test Case**: Invalid Token Format
**Endpoint**: Protected endpoint
**Token**: Malformed or expired

**Request Headers**:
```
Authorization: Bearer invalid_token_string
```

**Expected Response** (401):
```json
{
  "success": false,
  "message": "Invalid token"
}
```

**Test Assertions**:
- ✅ Status code is 401
- ✅ Invalid format detected
- ✅ Access denied

---

## Rate Limiting Test Scenarios

### Scenario 19: Rate Limit Headers

**Test Case**: Check Rate Limit Headers
**Endpoint**: Any endpoint
**Purpose**: Verify rate limiting enforcement

**Response Headers**:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1706414700
```

**Test Assertions**:
- ✅ X-RateLimit-Limit present
- ✅ X-RateLimit-Remaining is number
- ✅ X-RateLimit-Reset is Unix timestamp
- ✅ Remaining decrements with each request

**Rate Limits**:
- Auth endpoints: 5 requests / 15 minutes
- General endpoints: 100 requests / 15 minutes
- Admin endpoints: 20 requests / 15 minutes

---

### Scenario 20: Rate Limit Exceeded

**Test Case**: Auth Rate Limit Exceeded (After 5 attempts)
**Endpoint**: `POST /api/auth/login`
**Purpose**: Verify rate limit blocking

**After 5 login attempts within 15 minutes:**

**6th Request Response** (429):
```json
{
  "success": false,
  "message": "Too many login attempts. Please try again later.",
  "retryAfter": 900
}
```

**Response Headers**:
```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1706414700
Retry-After: 900
```

**Test Assertions**:
- ✅ Status code is 429 (Too Many Requests)
- ✅ Retry-After header present (seconds)
- ✅ X-RateLimit-Remaining is 0
- ✅ Error message indicates rate limit

---

## Security Test Scenarios

### Scenario 21: No Sensitive Data in Response

**Test Case**: Check Security Headers
**Endpoint**: Any endpoint
**Purpose**: Verify sensitive data not exposed

**Response Content Validation**:
```javascript
pm.test("No sensitive data in response", function () {
    const body = pm.response.text();
    pm.expect(body.toLowerCase()).to.not.include('password');
    pm.expect(body.toLowerCase()).to.not.include('secret');
    pm.expect(body.toLowerCase()).to.not.include('api_key');
});
```

**Test Assertions**:
- ✅ No password hashes in user responses
- ✅ No API keys exposed
- ✅ No credit card numbers
- ✅ No JWT secrets

---

## Data Integrity Test Scenarios

### Scenario 22: Create, Read, Update Verify

**Test Case**: Medical Record CRUD
**Purpose**: Verify data persists correctly

**Steps**:
1. Create record with title "Original Title"
2. Read record and verify title matches
3. Update title to "Updated Title"
4. Read again and verify update applied

**Assertions**:
- ✅ Step 1: Record created with ID
- ✅ Step 2: Title = "Original Title"
- ✅ Step 3: Update returns 200
- ✅ Step 4: Title = "Updated Title"

---

## Cleanup & Teardown

### Test Data Cleanup

**Automatic** (Development):
- Test users cleaned up older than 24 hours
- Test records deleted (soft-delete)
- Temporary inventory items removed
- Old payment records archived

**Manual** (If needed):
```bash
# Remove test user
DELETE /api/users/{{testUserId}}

# Clear test inventory
DELETE /api/inventory/{{testInventorySKU}}
```

---

## Performance Expectations

| Endpoint | Expected Time | Max Time |
|----------|---|---|
| Auth endpoints | 200-300ms | 500ms |
| User endpoints | 150-250ms | 400ms |
| Records CRUD | 200-400ms | 600ms |
| Prescription ops | 250-350ms | 700ms |
| Inventory ops | 150-300ms | 400ms |
| Payment init | 300-800ms | 1000ms |
| Health check | 50-100ms | 200ms |

If endpoints exceed max time, investigate:
- Database indexes
- Network latency
- Server resource usage
- Redis connection issues
- Elasticsearch queries

---

Last updated: January 28, 2026
