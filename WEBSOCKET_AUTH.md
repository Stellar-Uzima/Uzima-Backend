# WebSocket Authentication Implementation

## Overview
This document describes the implementation of JWT-based authentication for WebSocket connections in the Uzima Backend application.

## Components

### 1. Socket.IO Server Initialization (`src/services/realtime.service.js`)
- Creates a Socket.IO server with Redis adapter support for clustering
- Implements JWT-based authentication middleware
- Handles connection/disconnection events
- Provides utility functions for broadcasting messages

### 2. Authentication Middleware (`src/middleware/socketAuth.js`)
- Extracts JWT token from handshake (`auth.token` or `query.token`)
- Verifies token using `verifyAccessToken` utility
- Validates user existence and active status
- Attaches user information to the socket object
- Joins user to personal room (`user_{userId}`)
- Logs connection attempts (success/failure)

### 3. Utility Functions (`src/utils/websocketUtils.js`)
- Helper functions for common WebSocket operations
- Functions to send targeted messages to users/roles
- Connection status utilities

### 4. Inventory WebSocket Controller (`src/controllers/inventoryWsController.js`)
- Implements inventory-specific WebSocket events
- Handles `inventory:update` and `inventory:lowStock` events
- Provides role-based messaging capabilities

## Authentication Flow

1. Client initiates WebSocket connection with JWT token
2. Authentication middleware intercepts connection
3. Token is extracted and verified
4. User is fetched from database to validate existence/active status
5. User information is attached to socket object
6. Socket joins personal room (`user_{userId}`)
7. Connection attempt is logged
8. If validation passes, connection proceeds; otherwise, connection is rejected

## Events

### Client-Side Events
- `connected`: Sent when authentication succeeds

### Server-Side Events
- `inventory:update`: Broadcast when inventory items are updated
- `inventory:lowStock`: Broadcast when inventory falls below threshold
- Custom events as needed by application

## Security Features

1. **JWT Verification**: All WebSocket connections require valid JWT tokens
2. **User Validation**: Confirms user exists and is active in database
3. **Connection Logging**: All connection attempts (successful/failed) are logged
4. **Personal Rooms**: Each user joins a personal room for direct messaging
5. **Graceful Disconnection**: Proper handling of disconnections and errors

## Usage Examples

### Connecting from Client
```javascript
import io from 'socket.io-client';

// Connect with JWT token in auth object
const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token-here'
  }
});

socket.on('connected', (data) => {
  console.log('Connected as:', data.username);
});

socket.on('inventory:update', (data) => {
  console.log('Inventory updated:', data);
});
```

### Broadcasting Messages
```javascript
import { sendToAll, sendToUser } from './services/realtime.service.js';

// Send to all connected users
sendToAll('inventory:update', {
  item: 'medicine-x',
  quantity: 100
});

// Send to specific user
sendToUser(userId, 'private:notification', {
  message: 'This is a private message'
});
```

## Environment Variables
- `CLIENT_URL`: Allowed origin for CORS (defaults to `http://localhost:3000`)
- Standard JWT and Redis configuration variables

## Error Handling
- Invalid tokens result in immediate connection rejection
- Failed authentication attempts are logged
- Graceful error messages are provided to clients
- Server continues operating despite individual connection failures