# Server-Sent Events (SSE) Implementation

## Overview

This document describes the Server-Sent Events (SSE) implementation in the Uzima-Backend. SSE provides a lightweight, one-way communication channel for pushing real-time updates from the server to connected clients without the overhead of WebSockets.

## Architecture

### Components

1. **EventManager** (`src/services/eventManager.js`)
   - Core service managing SSE connections and event distribution
   - Implements connection tracking, heartbeat, and cleanup
   - Singleton instance managing all active connections

2. **SSE Controller** (`src/controllers/sseController.js`)
   - Express route handlers for `/events/stream` endpoint
   - Handles authentication and event filtering
   - Manages connection lifecycle

3. **SSE Routes** (`src/routes/sseRoutes.js`)
   - Defines API endpoints for SSE functionality
   - `/events/stream` - Main SSE endpoint
   - `/events/stats` - Connection statistics (admin only)
   - `/events/test` - Test event trigger (admin only)

4. **Event Emitter Utilities** (`src/utils/eventEmitter.js`)
   - High-level helper functions for emitting events from application code
   - Predefined event types: `record.created`, `notification`, `system.alert`, etc.

## API Endpoints

### 1. Stream Events (SSE)
**Endpoint:** `GET /events/stream`

**Authentication:** Required (JWT token via query parameter or Authorization header)

**Query Parameters:**
- `token` (optional) - JWT token as query parameter (alternative to Authorization header)
- `events` (optional) - Comma-separated list of event types to filter

**Response Headers:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
```

**Example Requests:**
```bash
# Using Authorization header
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:5000/events/stream

# Using query token with filtering
curl "http://localhost:5000/events/stream?token=YOUR_JWT_TOKEN&events=record.created,notification"

# Filter for specific events only
curl "http://localhost:5000/events/stream?token=YOUR_JWT_TOKEN&events=system.alert"
```

**Example Event Response:**
```
id: 1642700000000-abc123def
event: record.created
data: {"recordId":"60d5ec0f0a1b2c3d4e5f6g7h","title":"Patient Record","type":"medical","createdAt":"2024-01-22T10:30:00.000Z"}

:heartbeat 1642700030000

id: 1642700060000-xyz789uvw
event: notification
data: {"id":"60d5ec0f0a1b2c3d4e5f6g7i","title":"Reminder","message":"Appointment in 1 hour","type":"reminder"}
```

### 2. Connection Statistics
**Endpoint:** `GET /events/stats`

**Authentication:** Required (admin role)

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalConnections": 5,
    "userCount": 3,
    "userDetails": [
      {
        "userId": "user1",
        "connections": 2,
        "filters": [["record.created"], null]
      },
      {
        "userId": "user2",
        "connections": 1,
        "filters": [["notification", "system.alert"]]
      }
    ]
  },
  "timestamp": "2024-01-22T10:30:00.000Z"
}
```

### 3. Trigger Test Event
**Endpoint:** `POST /events/test`

**Authentication:** Required (admin role)

**Request Body:**
```json
{
  "eventType": "test.event",
  "data": {
    "message": "This is a test event"
  },
  "userId": null
}
```

**Response:**
```json
{
  "success": true,
  "message": "Event \"test.event\" triggered",
  "sentTo": "all users"
}
```

## Event Types

### Standard Events

1. **record.created**
   ```json
   {
     "recordId": "...",
     "title": "...",
     "type": "medical|prescription|report",
     "createdAt": "ISO8601 timestamp"
   }
   ```

2. **record.updated**
   ```json
   {
     "recordId": "...",
     "title": "...",
     "updatedAt": "ISO8601 timestamp"
   }
   ```

3. **system.alert**
   ```json
   {
     "message": "Alert message",
     "level": "info|warning|error",
     "details": {},
     "timestamp": "ISO8601 timestamp"
   }
   ```

4. **notification**
   ```json
   {
     "id": "...",
     "title": "...",
     "message": "...",
     "type": "reminder|alert|info",
     "read": false,
     "createdAt": "ISO8601 timestamp"
   }
   ```

5. **prescription.statusChanged**
   ```json
   {
     "prescriptionId": "...",
     "status": "pending|approved|filled",
     "previousStatus": "...",
     "updatedAt": "ISO8601 timestamp"
   }
   ```

6. **appointment.reminder**
   ```json
   {
     "appointmentId": "...",
     "title": "...",
     "scheduledTime": "ISO8601 timestamp",
     "reminderSentAt": "ISO8601 timestamp"
   }
   ```

### Custom Events
You can emit any custom event type using the event emitter utilities.

## Usage Examples

### From JavaScript/TypeScript Client

```javascript
// Connect to SSE stream with all events
const eventSource = new EventSource('http://localhost:5000/events/stream?token=YOUR_JWT_TOKEN');

// Listen to record creation events
eventSource.addEventListener('record.created', (event) => {
  const data = JSON.parse(event.data);
  console.log('New record:', data);
});

// Listen to system alerts
eventSource.addEventListener('system.alert', (event) => {
  const data = JSON.parse(event.data);
  console.log('System alert:', data.message);
});

// Listen to notifications
eventSource.addEventListener('notification', (event) => {
  const data = JSON.parse(event.data);
  console.log('Notification:', data.message);
});

// Handle connection errors
eventSource.onerror = (error) => {
  console.error('SSE error:', error);
  eventSource.close();
};

// Close connection
// eventSource.close();
```

### With Event Filtering

```javascript
// Only receive specific event types
const eventSource = new EventSource(
  'http://localhost:5000/events/stream?token=YOUR_JWT_TOKEN&events=notification,system.alert'
);
```

### From Backend Code

```javascript
import { 
  emitRecordCreated, 
  emitSystemAlert, 
  emitNotification 
} from '../utils/eventEmitter.js';

// Emit record creation event
const newRecord = await Record.create({...});
emitRecordCreated(newRecord);

// Emit to specific user
emitRecordCreated(newRecord, userId);

// Emit system alert
emitSystemAlert('Database backup completed', 'info', { duration: '5 minutes' });

// Emit notification
emitNotification({
  _id: notificationId,
  title: 'New Message',
  message: 'You have a new message',
  type: 'message',
  read: false,
  createdAt: new Date()
}, userId);

// Get connection statistics
import { getEventStats } from '../utils/eventEmitter.js';
const stats = getEventStats();
console.log(stats);
```

## Features

### 1. Keep-Alive Heartbeat
- Server sends heartbeat comment every 30 seconds
- Prevents reverse proxy/load balancer timeout
- Automatically removes failed heartbeat connections

### 2. Event Filtering
- Clients can filter events by type
- Multiple event types supported: `?events=type1,type2,type3`
- Reduces bandwidth for clients interested in specific events
- `null` filters (no filter parameter) receive all events

### 3. Connection Management
- Automatic tracking of all active connections
- Per-user connection support (multiple connections per user)
- Connection statistics and monitoring
- Configurable connection limits (default: 1000 concurrent)

### 4. Memory Leak Prevention
- Automatic cleanup of idle/abandoned connections
- Inactivity timeout: 60 seconds
- Graceful connection closure on client disconnect
- Proper error handling for broken connections

### 5. Authentication
- JWT token authentication required
- Supports token via query parameter or Authorization header
- User validation against database
- Role-based access to admin endpoints

### 6. Graceful Shutdown
- All connections properly closed on server shutdown
- Timers cleaned up to prevent memory leaks
- Integrated with application shutdown lifecycle

## Configuration

### EventManager Configuration

Located in `src/services/eventManager.js`:

```javascript
this.heartbeatInterval = 30000;      // 30 seconds
this.inactivityTimeout = 60000;      // 60 seconds
this.maxConnections = 1000;          // Max concurrent connections
```

Adjust these values based on your requirements:
- Increase `heartbeatInterval` for less frequent heartbeats (reduces bandwidth)
- Increase `inactivityTimeout` for longer idle connections
- Adjust `maxConnections` based on expected user load

## Monitoring

### Check Connection Statistics

```bash
curl -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  http://localhost:5000/events/stats
```

### Integration with Metrics

The EventManager emits events that can be captured for monitoring:

```javascript
import eventManager from './services/eventManager.js';

eventManager.on('connectionAdded', ({ userId, connectionId }) => {
  // Log or send to monitoring service
});

eventManager.on('connectionRemoved', ({ userId, connectionId, reason }) => {
  // Log or send to monitoring service
});

eventManager.on('eventBroadcasted', ({ eventType, timestamp }) => {
  // Log or send to monitoring service
});
```

## Performance Considerations

1. **Bandwidth**: SSE is text-based; consider compression for large payloads
2. **Connections**: Each connection holds an open HTTP connection; monitor server resources
3. **Event Frequency**: High-frequency events may impact network and client performance
4. **Filtering**: Use event filtering to reduce unnecessary data transmission
5. **Heartbeat**: Balance between connection stability and bandwidth usage

## Security

1. **Authentication**: All SSE connections require valid JWT token
2. **Authorization**: Admin endpoints require admin role
3. **User Isolation**: Events sent only to authenticated users (by default, all users receive all events)
4. **Token Validation**: Tokens verified on connection establishment
5. **CORS**: SSE endpoint respects CORS configuration

### Sending Events to Specific Users

To send events only to specific users, use the `userId` parameter:

```javascript
emitNotification(notification, specificUserId);
```

## Troubleshooting

### Connection Immediately Closes
- Check JWT token validity
- Verify authentication endpoint is accessible
- Check server logs for authentication errors

### Not Receiving Events
- Verify event type matches filter (if filtering is applied)
- Check connection is still active using stats endpoint
- Verify event is actually being emitted from backend

### High Memory Usage
- Check for connections from abandoned clients
- Monitor inactivity timeout setting
- Review connection statistics
- Check heartbeat failures

### Events Not Reaching Specific User
- Verify user ID is correct
- Check if user has active SSE connection
- Verify user has required permissions

## Testing

Run SSE tests:

```bash
npm test -- src/__tests__/sse.test.js
```

Test coverage includes:
- Connection management (add, remove, multiple users)
- Event broadcasting (all users, specific user, filtering)
- Keep-alive heartbeat
- Connection cleanup
- EventEmitter integration
- Graceful shutdown
- Connection limits

## Migration from WebSockets

If migrating from WebSockets:
1. SSE is simpler (HTTP-based, browser-native)
2. SSE is one-way; use HTTP POST for client → server communication
3. SSE has better compatibility with proxies/load balancers
4. WebSockets may be better for bi-directional, low-latency communication

## Best Practices

1. **Event Naming**: Use hierarchical names like `entity.action` (e.g., `record.created`)
2. **Payload Size**: Keep event payloads small; send IDs and let clients fetch full data
3. **Error Handling**: Implement reconnection logic in clients
4. **Filtering**: Use filtering to reduce bandwidth for high-frequency scenarios
5. **Testing**: Test with slow networks and connection drops
6. **Monitoring**: Log all connection events for troubleshooting
7. **Documentation**: Document custom event types for client teams

## Future Enhancements

1. Event persistence/replay for recently disconnected clients
2. Event queuing for offline clients
3. Redis pub/sub for multi-server deployments
4. Event compression (gzip)
5. Rate limiting per user/connection
6. Event versioning/schema validation
