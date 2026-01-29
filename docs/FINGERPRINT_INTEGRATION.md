# Browser Fingerprinting Integration Guide

This guide explains how to integrate FingerprintJS with your frontend application to enable device tracking and fraud detection.

## Overview

The Uzima Backend uses browser fingerprinting to:
- Track user devices and detect new device logins
- Identify impossible travel patterns (e.g., NY to Tokyo in 1 hour)
- Flag suspicious login activity
- Provide users with login history and device management

## Prerequisites

- FingerprintJS library
- Access to the Uzima Backend API
- User authentication flow in place

## Installation

### Option 1: Using NPM/Yarn

```bash
npm install @fingerprintjs/fingerprintjs
# or
yarn add @fingerprintjs/fingerprintjs
```

### Option 2: Using CDN

```html
<script src="https://cdn.jsdelivr.net/npm/@fingerprintjs/fingerprintjs@3/dist/fp.min.js"></script>
```

## Implementation

### 1. Initialize FingerprintJS

Create a fingerprint service in your frontend application:

```javascript
// services/fingerprintService.js
import FingerprintJS from '@fingerprintjs/fingerprintjs';

let fpPromise = null;

/**
 * Initialize FingerprintJS
 * Call this once when your app starts
 */
export async function initFingerprint() {
  if (!fpPromise) {
    fpPromise = FingerprintJS.load();
  }
  return fpPromise;
}

/**
 * Get browser fingerprint
 * @returns {Promise<Object>} Fingerprint data
 */
export async function getFingerprint() {
  try {
    const fp = await initFingerprint();
    const result = await fp.get();

    return {
      visitorId: result.visitorId,
      confidence: {
        score: result.confidence.score,
      },
      components: result.components, // Optional: include for additional context
    };
  } catch (error) {
    console.error('Failed to get fingerprint:', error);
    return null;
  }
}
```

### 2. Update Login Flow

Modify your login function to include the fingerprint:

```javascript
// services/authService.js
import { getFingerprint } from './fingerprintService';

export async function login(email, password) {
  try {
    // Get browser fingerprint
    const fingerprint = await getFingerprint();

    // Send login request with fingerprint
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        fingerprint, // Include fingerprint data
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Login failed');
    }

    // Handle security context from response
    if (data.data.security) {
      handleSecurityContext(data.data.security);
    }

    return data;
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
}

/**
 * Handle security context from login response
 * @param {Object} security - Security context
 */
function handleSecurityContext(security) {
  const {
    isNewDevice,
    isNewLocation,
    location,
    fraudFlags,
    fraudDetails,
  } = security;

  // Show notification if new device detected
  if (isNewDevice) {
    showNotification({
      type: 'info',
      title: 'New Device Login',
      message: `You logged in from a new device in ${location}`,
    });
  }

  // Show warning if impossible travel detected
  if (fraudFlags?.impossibleTravel) {
    showNotification({
      type: 'warning',
      title: 'Suspicious Activity Detected',
      message: `Impossible travel detected. If this wasn't you, please change your password immediately.`,
      actions: [
        {
          label: 'View Details',
          href: '/security/activity',
        },
      ],
    });
  }
}
```

### 3. React Component Example

Here's a complete React login component with fingerprinting:

```jsx
// components/LoginForm.jsx
import React, { useState, useEffect } from 'react';
import { initFingerprint, getFingerprint } from '../services/fingerprintService';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [securityAlert, setSecurityAlert] = useState(null);

  // Initialize fingerprinting when component mounts
  useEffect(() => {
    initFingerprint();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSecurityAlert(null);

    try {
      // Get fingerprint
      const fingerprint = await getFingerprint();

      if (!fingerprint) {
        console.warn('Failed to get fingerprint, proceeding without it');
      }

      // Login request
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          fingerprint,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      // Store tokens
      localStorage.setItem('accessToken', data.data.accessToken);
      localStorage.setItem('refreshToken', data.data.refreshToken);

      // Handle security alerts
      if (data.data.security) {
        const { isNewDevice, isNewLocation, fraudFlags, location } = data.data.security;

        if (fraudFlags?.impossibleTravel) {
          setSecurityAlert({
            type: 'danger',
            message: 'Suspicious activity detected! If this wasn\'t you, change your password immediately.',
          });
        } else if (isNewDevice) {
          setSecurityAlert({
            type: 'info',
            message: `Login from new device in ${location}`,
          });
        }
      }

      // Redirect to dashboard
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-form">
      <h2>Login</h2>

      {error && (
        <div className="alert alert-danger">
          {error}
        </div>
      )}

      {securityAlert && (
        <div className={`alert alert-${securityAlert.type}`}>
          {securityAlert.message}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />
        </div>

        <button type="submit" disabled={loading}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </div>
  );
}

export default LoginForm;
```

### 4. Vue.js Component Example

```vue
<!-- components/LoginForm.vue -->
<template>
  <div class="login-form">
    <h2>Login</h2>

    <div v-if="error" class="alert alert-danger">
      {{ error }}
    </div>

    <div v-if="securityAlert" :class="`alert alert-${securityAlert.type}`">
      {{ securityAlert.message }}
    </div>

    <form @submit.prevent="handleLogin">
      <div class="form-group">
        <label for="email">Email</label>
        <input
          type="email"
          id="email"
          v-model="email"
          required
          :disabled="loading"
        />
      </div>

      <div class="form-group">
        <label for="password">Password</label>
        <input
          type="password"
          id="password"
          v-model="password"
          required
          :disabled="loading"
        />
      </div>

      <button type="submit" :disabled="loading">
        {{ loading ? 'Logging in...' : 'Login' }}
      </button>
    </form>
  </div>
</template>

<script>
import { initFingerprint, getFingerprint } from '../services/fingerprintService';

export default {
  name: 'LoginForm',
  data() {
    return {
      email: '',
      password: '',
      loading: false,
      error: null,
      securityAlert: null,
    };
  },
  mounted() {
    // Initialize fingerprinting
    initFingerprint();
  },
  methods: {
    async handleLogin() {
      this.loading = true;
      this.error = null;
      this.securityAlert = null;

      try {
        // Get fingerprint
        const fingerprint = await getFingerprint();

        // Login request
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: this.email,
            password: this.password,
            fingerprint,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Login failed');
        }

        // Store tokens
        localStorage.setItem('accessToken', data.data.accessToken);
        localStorage.setItem('refreshToken', data.data.refreshToken);

        // Handle security alerts
        if (data.data.security) {
          const { isNewDevice, isNewLocation, fraudFlags, location } = data.data.security;

          if (fraudFlags?.impossibleTravel) {
            this.securityAlert = {
              type: 'danger',
              message: 'Suspicious activity detected! If this wasn\'t you, change your password immediately.',
            };
          } else if (isNewDevice) {
            this.securityAlert = {
              type: 'info',
              message: `Login from new device in ${location}`,
            };
          }
        }

        // Redirect to dashboard
        setTimeout(() => {
          this.$router.push('/dashboard');
        }, 1500);
      } catch (err) {
        this.error = err.message;
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>
```

## API Response Format

### Successful Login Response

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "username": "johndoe",
      "email": "john@example.com",
      "role": "patient"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "a1b2c3d4e5f6...",
    "security": {
      "isNewDevice": true,
      "isNewLocation": false,
      "deviceId": "507f191e810c19729de860ea",
      "location": "New York, United States",
      "fraudFlags": {
        "impossibleTravel": false,
        "suspiciousIp": false,
        "unusualActivity": false
      }
    }
  },
  "message": "Login successful"
}
```

### Login with Impossible Travel Detected

```json
{
  "success": true,
  "data": {
    "user": { ... },
    "accessToken": "...",
    "refreshToken": "...",
    "security": {
      "isNewDevice": false,
      "isNewLocation": true,
      "deviceId": "507f191e810c19729de860ea",
      "location": "Tokyo, Japan",
      "fraudFlags": {
        "impossibleTravel": true,
        "suspiciousIp": false,
        "unusualActivity": false
      },
      "fraudDetails": {
        "distanceKm": 10850,
        "timeDiffMinutes": 90,
        "calculatedSpeedKmh": 7233
      }
    }
  },
  "message": "Login successful"
}
```

## Security Endpoints

Once authenticated, users can access these security endpoints:

### Get All Devices

```javascript
GET /api/security/devices

const response = await fetch('/api/security/devices', {
  headers: {
    'Authorization': `Bearer ${accessToken}`,
  },
});
```

### Get Login Activity

```javascript
GET /api/security/activity?limit=50&flaggedOnly=false

const response = await fetch('/api/security/activity', {
  headers: {
    'Authorization': `Bearer ${accessToken}`,
  },
});
```

### Trust/Untrust Device

```javascript
PUT /api/security/devices/:deviceId/trust

const response = await fetch(`/api/security/devices/${deviceId}/trust`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    trusted: true,
  }),
});
```

### Remove Device

```javascript
DELETE /api/security/devices/:deviceId

const response = await fetch(`/api/security/devices/${deviceId}`, {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
  },
});
```

## Best Practices

1. **Initialize Early**: Initialize FingerprintJS as early as possible in your app lifecycle to ensure it's ready when users attempt to login.

2. **Graceful Degradation**: If fingerprinting fails, allow login to proceed. The backend will handle missing fingerprints gracefully.

3. **User Education**: Inform users about device tracking in your privacy policy and provide clear explanations of security alerts.

4. **Security Notifications**: Display security-related notifications prominently to alert users of suspicious activity.

5. **Device Management UI**: Provide an intuitive interface for users to view and manage their trusted devices.

6. **Error Handling**: Handle fingerprinting errors gracefully without blocking the login flow.

## Troubleshooting

### Fingerprint Not Being Captured

```javascript
// Add debug logging
const fingerprint = await getFingerprint();
console.log('Fingerprint captured:', fingerprint);

if (!fingerprint) {
  console.error('Fingerprinting failed - check browser compatibility');
}
```

### Security Alerts Not Showing

Check that you're handling the `security` object from the login response:

```javascript
if (data.data.security) {
  console.log('Security context:', data.data.security);
  // Display appropriate alerts based on flags
}
```

### CORS Issues

Ensure your backend CORS configuration allows fingerprinting headers:

```javascript
// Backend: src/config/cors.js
cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
})
```

## Privacy Considerations

- Fingerprinting is used solely for security purposes
- User data is encrypted and stored securely
- Users can view and manage their tracked devices
- Compliance with GDPR and privacy regulations

## Support

For issues or questions:
- Check the [API Documentation](./API_DOCS.md)
- Review [Security Best Practices](./SECURITY.md)
- Contact support@uzima.health

## References

- [FingerprintJS Documentation](https://dev.fingerprintjs.com/docs)
- [Uzima Backend API Documentation](./API_DOCS.md)
- [Security Configuration Guide](./SECURITY_CONFIG.md)
