# API Versioning and Migration Guide

## Overview

The Uzima Backend API now supports versioning to ensure backward compatibility during breaking changes. This allows existing clients to continue working while new features and improvements are added.

## Supported Versions

### Current Version: v2
- **Status**: Active
- **Base URL**: `/api/v2`
- **Recommended for**: All new integrations

### Legacy Version: v1
- **Status**: Deprecated
- **Base URL**: `/api/v1` or `/api` (default)
- **Deprecation Date**: July 22, 2025
- **Sunset Date**: July 22, 2026
- **Recommended**: Migrate to v2 before sunset date

## Checking API Version

### Version Information Endpoint

```bash
GET /version
```

**Response:**
```json
{
  "current": "v2",
  "supported": [
    {
      "version": "v1",
      "number": "1.0.0",
      "deprecated": true,
      "deprecationDate": "2025-07-22",
      "sunsetDate": "2026-07-22"
    },
    {
      "version": "v2",
      "number": "2.0.0",
      "deprecated": false
    }
  ],
  "deprecationPolicy": "Deprecated versions are supported for 12 months after deprecation date"
}
```

## Using Versioned APIs

### v1 (Deprecated)

```bash
# Explicit v1
GET /api/v1/users

# Legacy default (also routes to v1)
GET /api/users
```

**Deprecation Headers:**
```
X-API-Deprecated: true
X-API-Deprecation-Date: 2025-07-22
X-API-Sunset-Date: 2026-07-22
X-API-Current-Version: v2
X-API-Version: 1.0.0
Link: </api/v2>; rel="successor-version"
```

### v2 (Current)

```bash
GET /api/v2/users
```

**Response Headers:**
```
X-API-Version: 2.0.0
```

## Migration from v1 to v2

### Step 1: Update Base URL

Change all API calls from `/api` or `/api/v1` to `/api/v2`:

```javascript
// Before
const response = await fetch('https://api.example.com/api/users');

// After
const response = await fetch('https://api.example.com/api/v2/users');
```

### Step 2: Test in Parallel

Both versions run simultaneously. Test your integration with v2 while v1 is still active:

1. Update one endpoint at a time
2. Verify responses match expected format
3. Monitor for errors

### Step 3: Monitor Deprecation Headers

Check for deprecation warnings in v1 responses:

```javascript
const response = await fetch('https://api.example.com/api/users');
if (response.headers.get('X-API-Deprecated') === 'true') {
  const sunsetDate = response.headers.get('X-API-Sunset-Date');
  console.warn(`API v1 will be sunset on ${sunsetDate}`);
}
```

### Step 4: Complete Migration

Ensure all clients are using v2 before the v1 sunset date (July 22, 2026).

## Key Changes in v2

- All endpoints maintain the same structure
- Response format consistency improvements
- Enhanced error handling
- Better validation messages

## Timeline

| Date | Event |
|------|-------|
| January 22, 2026 | v2 released, v1 deprecated |
| July 22, 2026 | v1 sunset (no longer supported) |

## Best Practices

1. **Always specify version**: Use `/api/v2` instead of `/api` for new integrations
2. **Monitor deprecation headers**: Set up alerts for deprecated API usage
3. **Test early**: Start testing v2 as soon as possible
4. **Update gradually**: Migrate endpoints incrementally
5. **Check version endpoint**: Regularly verify supported versions

## Error Handling

### Unsupported Version

```bash
GET /api/v0/users
```

**Response (410 Gone):**
```json
{
  "error": "API Version Not Supported",
  "message": "API v0 is no longer supported",
  "currentVersion": "v2"
}
```

## Support

For migration assistance:
- Check API documentation at `/api-docs`
- Review version info at `/version`
- Monitor response headers for deprecation warnings

## Removing Old Versions (For Maintainers)

To remove v1 after sunset:

1. Update `/src/middleware/apiVersion.js`:
```javascript
v1: {
  supported: false, // Disable v1
}
```

2. Remove v1 router from `/src/index.js`:
```javascript
// Remove this line
app.use('/api/v1', createV1Router());
```

3. Update default `/api` route to v2 or remove legacy support
