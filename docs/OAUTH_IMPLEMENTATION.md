# OAuth2 Social Login Integration

This implementation provides OAuth2 authentication support for Google, GitHub, and Microsoft, allowing users to sign in without passwords.

## Features Implemented

### ✅ Core Requirements
- **Multiple OAuth Providers**: Google, GitHub, and Microsoft authentication
- **OAuth Endpoints**: `/auth/google`, `/auth/github`, `/auth/microsoft`
- **Callback Handling**: Secure OAuth callback processing with JWT token generation
- **Account Linking**: Link OAuth accounts to existing users by email
- **Secure Token Storage**: Encrypted storage of OAuth access and refresh tokens
- **Account Unlinking**: `/auth/unlink/:provider` endpoint to disconnect OAuth accounts
- **User Management**: Create or update user records on successful OAuth

### ✅ Security Features
- **Token Encryption**: AES-256-GCM encryption for OAuth tokens
- **CSRF Protection**: State parameter validation
- **Rate Limiting**: OAuth attempt rate limiting
- **Session Management**: Secure session configuration
- **Audit Trail**: Complete logging of OAuth activities

### ✅ Additional Features
- **Provider Status**: Check which OAuth providers are enabled
- **Account Management**: View linked OAuth accounts
- **Token Refresh**: OAuth token refresh functionality
- **Comprehensive Testing**: Integration tests for all providers

## API Endpoints

### Public Endpoints
```
GET  /api/auth/providers              # Get enabled OAuth providers
GET  /api/auth/google                # Redirect to Google OAuth
GET  /api/auth/github                # Redirect to GitHub OAuth
GET  /api/auth/microsoft             # Redirect to Microsoft OAuth
GET  /api/auth/google/callback       # Google OAuth callback
GET  /api/auth/github/callback       # GitHub OAuth callback
GET  /api/auth/microsoft/callback    # Microsoft OAuth callback
```

### Protected Endpoints (Require Authentication)
```
GET    /api/auth/accounts            # Get linked OAuth accounts
GET    /api/auth/status              # Get OAuth authentication status
POST   /api/auth/link/:provider      # Link OAuth account to user
DELETE /api/auth/unlink/:provider    # Unlink OAuth account
POST   /api/auth/refresh/:provider   # Refresh OAuth tokens
```

## Setup Instructions

### 1. Install Dependencies
```bash
npm install passport passport-google-oauth20 passport-github2 passport-microsoft passport-jwt express-session
```

### 2. Environment Configuration
Copy `.env.oauth.example` to your `.env` file and configure:

```bash
# Google OAuth2
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback

# GitHub OAuth2
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=http://localhost:5000/api/auth/github/callback

# Microsoft OAuth2
MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret
MICROSOFT_CALLBACK_URL=http://localhost:5000/api/auth/microsoft/callback

# Security
OAUTH_SESSION_SECRET=your_session_secret
OAUTH_ENCRYPTION_KEY=your_encryption_key
FRONTEND_URL=http://localhost:3000
```

### 3. Get OAuth Credentials

#### Google OAuth2
1. Go to [Google Cloud Console](https://console.developers.google.com/)
2. Create a new project or select existing one
3. Enable Google+ API
4. Create OAuth2 credentials for Web application
5. Add authorized redirect URI: `http://localhost:5000/api/auth/google/callback`

#### GitHub OAuth2
1. Go to [GitHub Settings > Developer settings](https://github.com/settings/applications)
2. Create new OAuth App
3. Set Authorization callback URL: `http://localhost:5000/api/auth/github/callback`

#### Microsoft OAuth2
1. Go to [Azure Portal](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps)
2. Register new application
3. Add Web platform with redirect URI: `http://localhost:5000/api/auth/microsoft/callback`
4. Add delegated permissions (email, profile, openid)

## Database Schema

### User Model Updates
```javascript
oauthAccounts: {
  google: {
    id: String,
    email: String,
    name: String,
    avatar: String,
    accessToken: String,    // Encrypted
    refreshToken: String,   // Encrypted
    linkedAt: Date
  },
  github: {
    id: String,
    username: String,
    email: String,
    name: String,
    avatar: String,
    accessToken: String,    // Encrypted
    refreshToken: String,   // Encrypted
    linkedAt: Date
  },
  microsoft: {
    id: String,
    email: String,
    name: String,
    avatar: String,
    accessToken: String,    // Encrypted
    refreshToken: String,   // Encrypted
    linkedAt: Date
  }
}
```

## Usage Examples

### Frontend Integration
```javascript
// Redirect to OAuth provider
window.location.href = '/api/auth/google';

// Handle OAuth callback (frontend redirect)
const urlParams = new URLSearchParams(window.location.search);
const accessToken = urlParams.get('access_token');
const refreshToken = urlParams.get('refresh_token');
const provider = urlParams.get('provider');

// Store tokens and redirect to dashboard
localStorage.setItem('accessToken', accessToken);
localStorage.setItem('refreshToken', refreshToken);
window.location.href = '/dashboard';
```

### Get Linked Accounts
```javascript
const response = await fetch('/api/auth/accounts', {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});
const accounts = await response.json();
```

### Unlink OAuth Account
```javascript
const response = await fetch('/api/auth/unlink/google', {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});
```

## Security Considerations

### Token Encryption
- OAuth tokens are encrypted using AES-256-GCM
- Encryption keys are stored in environment variables
- Tokens are never exposed in logs or responses

### CSRF Protection
- State parameters are generated for each OAuth request
- State validation prevents CSRF attacks
- Secure random generation using crypto module

### Rate Limiting
- Maximum 5 OAuth attempts per hour per IP
- Configurable time windows and limits
- Automatic reset after time window expires

## Testing

Run the OAuth integration tests:
```bash
npm test src/__tests__/oauth.test.js
```

The test suite covers:
- OAuth provider endpoints
- Callback handling
- Account linking/unlinking
- User model methods
- Authentication flows

## File Structure

```
src/
├── config/
│   ├── oauth.js              # OAuth configuration
│   └── passport.js          # Passport strategies
├── controllers/
│   └── oauthController.js    # OAuth logic
├── middleware/
│   └── oauthSecurity.js      # Security utilities
├── models/
│   └── User.js              # Updated with OAuth fields
├── routes/
│   └── oauthRoutes.js        # OAuth endpoints
└── __tests__/
    └── oauth.test.js         # Integration tests
```

## Error Handling

### Common Error Scenarios
1. **Missing OAuth credentials**: Providers disabled gracefully
2. **Invalid state parameter**: CSRF protection triggers
3. **Account already linked**: Clear error messages
4. **Last auth method unlink**: Prevents account lockout
5. **Token refresh failures**: Graceful degradation

### Error Response Format
```javascript
{
  "success": false,
  "message": "OAuth account for google is already linked to another user",
  "error": "CONFLICT"
}
```

## Monitoring and Logging

All OAuth activities are logged:
- Login attempts (success/failure)
- Account linking/unlinking
- Token refresh operations
- Security events (rate limiting, CSRF)

Logs include:
- User ID and provider
- IP address and user agent
- Timestamp and duration
- Relevant metadata

## Production Deployment

### Environment Variables
- Use strong, unique secrets
- Configure proper callback URLs
- Set secure cookie settings
- Enable HTTPS

### Security Headers
```
Set-Cookie: secure; HttpOnly; SameSite=Strict
Content-Security-Policy: default-src 'self'
X-Frame-Options: DENY
```

### Database Indexes
```javascript
// Compound indexes for OAuth queries
db.users.createIndex({ "oauthAccounts.google.id": 1 })
db.users.createIndex({ "oauthAccounts.github.id": 1 })
db.users.createIndex({ "oauthAccounts.microsoft.id": 1 })
```

## Troubleshooting

### Common Issues
1. **Redirect URI mismatch**: Check OAuth app configuration
2. **CORS errors**: Verify frontend URL in environment
3. **Session issues**: Check session secret configuration
4. **Token encryption**: Ensure encryption key is set

### Debug Mode
Enable debug logging:
```bash
DEBUG=oauth:* npm start
```

This implementation provides a complete, secure, and scalable OAuth2 authentication system for the Uzima Backend.
