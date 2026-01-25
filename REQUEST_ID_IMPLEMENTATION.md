# Request ID Implementation Documentation

## Overview
This implementation provides comprehensive request ID generation and propagation for distributed tracing and debugging in the Uzima-Backend application.

## Features Implemented

### 1. Request ID Generation
- **Location**: `src/middleware/correlationId.js`
- **Function**: Generates unique UUID v4 request IDs for each incoming request
- **Header**: Uses `X-Request-ID` header (standard for request tracing)
- **Fallback**: Automatically generates new UUID if no existing header present

### 2. Response Headers
- **Header**: `X-Request-ID` automatically added to all responses
- **Value**: Matches the request ID used for the request
- **Backward Compatibility**: Maintains `correlationId` property for existing code

### 3. Request ID Logging
- **Location**: `src/middleware/requestLogger.js`
- **Integration**: All log messages include request ID
- **Format**: `[request-id]` prefix in all console output
- **Priority**: Uses `requestId` first, falls back to `correlationId` and headers

### 4. External Service Propagation
- **Location**: `src/utils/requestId.js`
- **Utilities**:
  - `addRequestIdToHeaders()` - Adds X-Request-ID to external call headers
  - `fetchWithRequestId()` - Enhanced fetch with automatic ID propagation
  - `setupAxiosRequestIdInterceptor()` - Axios interceptor for automatic propagation
  - `getRequestIdFromRequest()` - Extracts request ID from various sources

## Usage Examples

### Basic Request ID Access
```javascript
// In any controller or middleware
app.get('/api/example', (req, res) => {
  const requestId = req.requestId; // Primary method
  const legacyId = req.correlationId; // Backward compatibility
  
  req.log.info('Processing request'); // Automatically includes request ID
  res.json({ requestId });
});
```

### External Service Calls
```javascript
import { addRequestIdToHeaders, fetchWithRequestId } from '../utils/requestId.js';

// Method 1: Add to existing options
const options = { method: 'GET', headers: { 'Content-Type': 'application/json' } };
const enhancedOptions = addRequestIdToHeaders(options, req.requestId);

// Method 2: Use enhanced fetch
const response = await fetchWithRequestId('https://api.example.com', options, req.requestId);
```

### Axios Integration
```javascript
import axios from 'axios';
import { setupAxiosRequestIdInterceptor, createRequestIdProvider } from '../utils/requestId.js';

const apiClient = axios.create();
const requestIdProvider = createRequestIdProvider(req);
setupAxiosRequestIdInterceptor(apiClient, requestIdProvider);

// All subsequent calls will automatically include X-Request-ID
const response = await apiClient.get('https://api.example.com');
```

## Testing Results
All core functionality tested and verified:
- ✅ UUID Generation (unique, proper format)
- ✅ Header Addition (X-Request-ID in responses)
- ✅ Request ID Extraction (priority order maintained)
- ✅ Middleware Functionality (generation and propagation)
- ✅ Backward Compatibility (correlationId preserved)

## Acceptance Criteria Met

1. **Every request has unique ID** ✅
   - UUID v4 generation ensures uniqueness
   - Automatic generation for requests without existing ID

2. **IDs returned in response headers** ✅
   - X-Request-ID header added to all responses
   - Matches the request ID used for processing

3. **Logs include request ID** ✅
   - All log messages prefixed with request ID
   - Structured logging with requestId field

4. **External calls propagate ID** ✅
   - Utility functions for header propagation
   - Axios interceptors for automatic propagation
   - Enhanced fetch wrapper

5. **Debugging easier with request tracing** ✅
   - End-to-end request tracking capability
   - Standard X-Request-ID header format
   - Comprehensive logging integration

## Migration Notes
- Existing code using `req.correlationId` continues to work
- New code should use `req.requestId` for consistency
- External service integration requires explicit utility usage
- No breaking changes to existing API contracts
