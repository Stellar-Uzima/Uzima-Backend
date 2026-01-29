# SSE Quick Reference Guide

## Files Created

```
src/
  services/
    └── eventManager.js                    # Core SSE connection management
  controllers/
    └── sseController.js                   # SSE endpoint handlers
  routes/
    └── sseRoutes.js                       # SSE route definitions
  utils/
    └── eventEmitter.js                    # Event emission utilities
  __tests__/
    └── sse.test.js                        # Comprehensive SSE tests
  
Root:
  ├── SSE_DOCUMENTATION.md                 # Full documentation
  └── SSE_INTEGRATION_EXAMPLES.js          # Integration examples
```

## Modified Files

```
src/
  ├── index.js                             # Added SSE routes import
  └── shutdown.js                          # Added event manager shutdown
```

## Quick Start

### 1. Connect Client to SSE Stream

```javascript
const eventSource = new EventSource(
  'http://localhost:5000/events/stream?token=YOUR_JWT_TOKEN'
);

eventSource.addEventListener('record.created', (e) => {
  console.log('Record created:', JSON.parse(e.data));
});

eventSource.addEventListener('notification', (e) => {
  console.log('Notification:', JSON.parse(e.data));
});
```

### 2. Emit Event from Backend

```javascript
import { emitRecordCreated } from './utils/eventEmitter.js';

const record = await Record.create({...});
emitRecordCreated(record);
```

### 3. Filter Events by Type

```javascript
// Client-side
const eventSource = new EventSource(
  'http://localhost:5000/events/stream?token=TOKEN&events=notification,system.alert'
);
```

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/events/stream` | JWT | Connect to SSE stream |
| GET | `/events/stats` | JWT + Admin | Get connection statistics |
| POST | `/events/test` | JWT + Admin | Trigger test event |

## Supported Event Types

- `record.created` - When a record is created
- `record.updated` - When a record is updated
- `system.alert` - System-level alerts
- `notification` - User notifications
- `prescription.statusChanged` - Prescription status updates
- `appointment.reminder` - Appointment reminders
- Custom events - Any custom type

## Configuration

Edit `src/services/eventManager.js`:

```javascript
this.heartbeatInterval = 30000;      // 30 seconds
this.inactivityTimeout = 60000;      // 60 seconds
this.maxConnections = 1000;          // Max concurrent connections
```

## Key Features

✅ Lightweight HTTP-based communication  
✅ Automatic keep-alive heartbeat (30s)  
✅ Event filtering by type  
✅ Multi-user support  
✅ Memory leak prevention (60s inactivity cleanup)  
✅ JWT authentication  
✅ Connection statistics monitoring  
✅ Graceful shutdown handling  
✅ Comprehensive test coverage  

## Common Patterns

### Broadcast to all users
```javascript
emitRecordCreated(record);
```

### Send to specific user
```javascript
emitNotification(notification, userId);
```

### System alerts
```javascript
emitSystemAlert('Database backup complete', 'info', {duration: '5 min'});
```

### Error alerts
```javascript
emitSystemAlert('Error occurred', 'error', {error: err.message});
```

## Testing

```bash
# Run SSE tests
npm test -- src/__tests__/sse.test.js

# Run all tests
npm test
```

## Monitoring

Check connection stats:
```bash
curl -H "Authorization: Bearer ADMIN_TOKEN" \
  http://localhost:5000/events/stats
```

## Client Reconnection

Modern browsers handle automatic reconnection. For explicit control:

```javascript
const eventSource = new EventSource(url);

eventSource.onerror = () => {
  // Browser will automatically retry
  eventSource.close();
  // Reconnect after delay
  setTimeout(() => {
    location.reload(); // or create new EventSource
  }, 5000);
};
```

## Browser Support

✅ Chrome/Edge 6+  
✅ Firefox 6+  
✅ Safari 5.1+  
✅ Mobile browsers (iOS Safari 5.1+, Chrome Mobile)  
❌ Internet Explorer (use polyfill)  

## Performance Tips

1. **Use filtering** - Only receive events you need
2. **Keep payloads small** - Send IDs, let clients fetch details
3. **Adjust heartbeat** - Balance stability vs bandwidth
4. **Monitor connections** - Check `/events/stats` regularly
5. **Test reconnection** - Ensure clients handle disconnects

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Connection immediately closes | Check JWT token validity |
| Not receiving events | Verify event type isn't filtered |
| High memory usage | Check connection stats, increase cleanup rate |
| Events not reaching user | Verify user ID, check connection is active |

## Integration Checklist

- [ ] Import `eventEmitter` utilities in controllers
- [ ] Add event emission after create operations
- [ ] Add event emission after update operations
- [ ] Add event emission for status changes
- [ ] Update client to listen for events
- [ ] Test with slow/unstable network
- [ ] Monitor connection statistics
- [ ] Configure heartbeat as needed
- [ ] Test graceful shutdown

## Next Steps

1. **Add SSE to existing controllers** - See `SSE_INTEGRATION_EXAMPLES.js`
2. **Update frontend** - Implement EventSource listeners
3. **Monitor stats** - Set up stats endpoint monitoring
4. **Configure** - Adjust timeouts and limits as needed
5. **Test** - Run comprehensive tests and manual testing

## Support

For issues or questions:
- Check `SSE_DOCUMENTATION.md` for detailed info
- Review `SSE_INTEGRATION_EXAMPLES.js` for code samples
- Run tests: `npm test -- src/__tests__/sse.test.js`
- Check connection stats: GET `/events/stats`
