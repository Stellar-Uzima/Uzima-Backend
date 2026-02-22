# Notification Worker System

A robust background job processing system for handling email and push notifications with retry logic, exponential backoff, and delivery status tracking.

## 🚀 Features

### **Core Functionality**
- **Dual Queue Support**: Separate queues for email and push notifications
- **Exponential Backoff**: Intelligent retry mechanism with jitter to prevent thundering herd
- **Delivery Status Tracking**: Real-time status updates in database
- **Job Prioritization**: Priority-based job processing (1-10 scale)
- **Graceful Shutdown**: Clean worker termination with signal handling
- **Health Monitoring**: Built-in health checks and metrics
- **Comprehensive Logging**: Detailed logging for monitoring and debugging

### **Queue Management**
- **Email Queue**: `notification-email` - Handles email notifications
- **Push Queue**: `notification-push` - Handles push notifications
- **Retry Logic**: Up to 5 attempts with exponential backoff
- **Job Retention**: Configurable retention of completed/failed jobs

### **Worker Configuration**
- **Concurrency**: Configurable concurrent processing (5 email, 10 push by default)
- **Backoff Strategy**: Exponential with jitter (2s base, 5min max delay)
- **Error Handling**: Comprehensive error tracking and recovery
- **Resource Management**: Proper cleanup and memory management

## 📁 File Structure

```
src/
├── workers/
│   ├── notificationWorker.js      # Main worker service entry point
│   ├── index.js               # Worker service class and signal handlers
│   └── notificationWorker.js   # Queue management and job processors
├── routes/
│   └── notificationQueueRoutes.js  # Admin API endpoints for queue management
└── models/
    └── Notification.js           # Notification model with status tracking
```

## 🛠️ Usage

### **Starting the Worker Service**

```bash
# Development mode (default concurrency)
npm run worker:notifications

# Development mode with custom concurrency
npm run worker:notifications:dev -- --email-concurrency 10 --push-concurrency 20

# Production mode with higher concurrency
npm run worker:notifications:prod
```

### **Worker CLI Options**

```bash
node workers/notificationWorker.js [options]

Options:
  --email-concurrency <number>  Email worker concurrency (default: 5)
  --push-concurrency <number>  Push worker concurrency (default: 10)
  --env <string>           Environment (default: development)
  --help, -h              Show help message
```

### **Queue Management API**

#### **Get Queue Statistics**
```http
GET /api/admin/notifications/queues/stats
Authorization: Bearer <admin_token>
```

#### **Pause Queues**
```http
POST /api/admin/notifications/queues/pause
Authorization: Bearer <admin_token>
```

#### **Resume Queues**
```http
POST /api/admin/notifications/queues/resume
Authorization: Bearer <admin_token>
```

#### **Health Check**
```http
GET /api/admin/notifications/queues/health
Authorization: Bearer <admin_token>
```

#### **Test Email Notification**
```http
POST /api/admin/notifications/queues/test-email
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "to": "test@example.com",
  "subject": "Test Email",
  "message": "<p>This is a test email from the notification worker.</p>",
  "priority": 5
}
```

#### **Test Push Notification**
```http
POST /api/admin/notifications/queues/test-push
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "userId": "507f1f77bcf86cd7994390e",
  "title": "Test Push",
  "message": "This is a test push notification",
  "priority": 5
}
```

## 🔄 Retry Logic

### **Exponential Backoff Algorithm**
```javascript
delay = min(baseDelay * 2^(attempt-1) + jitter, maxDelay)
// baseDelay: 2000ms (2 seconds)
// maxDelay: 300000ms (5 minutes)
// jitter: 30% of delay to prevent thundering herd
```

### **Retry Attempts**
- **Maximum Attempts**: 5 retries per job
- **Backoff Delays**: 2s, 4s, 8s, 16s, 32s (with jitter)
- **Failed Job Handling**: Jobs marked as permanently failed after max attempts
- **Error Tracking**: Detailed error messages and codes stored in database

## 📊 Status Tracking

### **Notification Statuses**
- **`pending`**: Initial state, waiting to be queued
- **`queued`**: Added to queue, waiting for processing
- **`retrying`**: Currently being processed or retried
- **`sent`**: Successfully delivered
- **`failed`**: Permanently failed after all retries

### **Database Logging**
```javascript
// Status updates are automatically logged
await updateNotificationStatus(notificationId, 'sent', {
  completedAt: new Date(),
  messageId: 'provider_message_id',
});

// Failed attempts include error details
await updateNotificationStatus(notificationId, 'failed', {
  errorMessage: error.message,
  errorCode: 'SEND_FAILED',
  attempts: 3,
  lastAttemptAt: new Date(),
});
```

## 🏥 Performance Optimizations

### **Concurrency Control**
- **Email Workers**: 5 concurrent jobs (I/O bound)
- **Push Workers**: 10 concurrent jobs (network bound)
- **Memory Management**: Automatic cleanup of completed/failed jobs
- **Connection Pooling**: Reused Redis connections

### **Queue Configuration**
```javascript
const queueOptions = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 2000, // 2 seconds
  },
  removeOnComplete: 100, // Keep last 100 completed jobs
  removeOnFail: 50,    // Keep last 50 failed jobs
};
```

## 🔧 Configuration

### **Environment Variables**
```bash
# Redis Configuration
REDIS_URL=redis://localhost:6379

# Email Configuration
RESEND_API_KEY=your_resend_api_key
MAIL_FROM=noreply@uzima.health

# Push Notification Configuration (implement as needed)
PUSH_SERVICE_API_KEY=your_push_service_key
```

### **Worker Configuration**
```javascript
// Custom worker settings
const workerConfig = {
  emailConcurrency: 5,    // Email processing threads
  pushConcurrency: 10,    // Push processing threads
  maxRetries: 5,          // Maximum retry attempts
  baseDelay: 2000,        // Base backoff delay (ms)
  maxDelay: 300000,       // Maximum backoff delay (ms)
};
```

## 🔍 Monitoring & Health

### **Health Check Response**
```json
{
  "status": "healthy",
  "timestamp": "2024-02-22T12:00:00.000Z",
  "metrics": {
    "successRate": 0.98,
    "totalProcessed": 1250,
    "successful": 1225,
    "failed": 25,
    "pending": 3
  },
  "queues": {
    "email": {
      "waiting": 12,
      "active": 3,
      "completed": 850,
      "failed": 15,
      "delayed": 2
    },
    "push": {
      "waiting": 8,
      "active": 2,
      "completed": 375,
      "failed": 10,
      "delayed": 1
    }
  },
  "uptime": 86400
}
```

### **Queue Statistics**
```json
{
  "email": {
    "waiting": 12,
    "active": 3,
    "completed": 850,
    "failed": 15,
    "delayed": 2
  },
  "push": {
    "waiting": 8,
    "active": 2,
    "completed": 375,
    "failed": 10,
    "delayed": 1
  }
}
```

## 🚨 Error Handling

### **Common Error Scenarios**
1. **Provider API Errors**: Temporary failures, rate limits, service unavailable
2. **Network Issues**: Connection timeouts, DNS failures
3. **Configuration Errors**: Missing API keys, invalid settings
4. **Database Errors**: Connection issues, validation failures
5. **Resource Exhaustion**: Memory limits, connection pool exhaustion

### **Error Recovery**
- **Automatic Retries**: Built-in exponential backoff
- **Manual Retry**: API endpoints for manual retry of failed jobs
- **Circuit Breaking**: Optional circuit breaker pattern implementation
- **Dead Letter Queue**: Failed jobs can be moved to DLQ for analysis

## 🔐 Security

### **Access Control**
- **Admin Only**: All queue management endpoints require admin role
- **JWT Authentication**: Bearer token required for all endpoints
- **Rate Limiting**: Built-in rate limiting for queue operations
- **Input Validation**: Joi validation for all API inputs

### **Data Protection**
- **PII Filtering**: Sensitive data logging controls
- **Encryption**: Optional encryption for notification content
- **Audit Trail**: Complete audit trail of all operations
- **Tenant Isolation**: Multi-tenant data separation

## 📝 Integration Examples

### **Queue Email Notification**
```javascript
import { enqueueEmailNotification } from './workers/notificationWorker.js';

const notification = await enqueueEmailNotification({
  notificationId: '507f1f77bcf86cd7994390e',
  to: 'user@example.com',
  subject: 'Welcome to Uzima',
  html: '<h1>Welcome!</h1><p>Thanks for joining Uzima Health.</p>',
  text: 'Welcome to Uzima Health. Thanks for joining!',
  type: 'welcome',
  userId: '507f1f77bcf86cd7994390e',
}, 7); // High priority
```

### **Queue Push Notification**
```javascript
import { enqueuePushNotification } from './workers/notificationWorker.js';

const notification = await enqueuePushNotification({
  notificationId: '507f1f77bcf86cd7994390f',
  userId: '507f1f77bcf86cd7994390e',
  title: 'New Appointment',
  message: 'You have a new appointment scheduled.',
  data: {
    appointmentId: '507f1f77bcf86cd7994390g',
    type: 'appointment_reminder',
  },
}, 8); // High priority
```

## 🔄 Deployment

### **Development**
```bash
# Start worker in development
npm run worker:notifications:dev

# Monitor logs
tail -f logs/notifications.log
```

### **Production**
```bash
# Start worker in production
npm run worker:notifications:prod

# Using PM2 for process management
pm2 start ecosystem.config.js --env production
```

### **Docker Deployment**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
EXPOSE 3000
CMD ["npm", "run", "worker:notifications:prod"]
```

## 🧪 Testing

### **Unit Tests**
```bash
# Run worker tests
npm test -- --testPathPattern=workers/

# Test with coverage
npm run test:coverage -- --testPathPattern=workers/
```

### **Integration Tests**
```bash
# Test queue operations
npm run test:api

# Manual testing scripts
node scripts/test-notification-worker.js
```

## 📈 Scaling Considerations

### **Horizontal Scaling**
- **Multiple Workers**: Run multiple worker instances
- **Load Balancing**: Redis automatically distributes jobs
- **Resource Allocation**: Monitor CPU/memory usage
- **Queue Partitioning**: Optional queue sharding by tenant

### **Performance Tuning**
- **Concurrency Adjustment**: Based on queue depth and processing time
- **Redis Optimization**: Connection pooling and pipelining
- **Memory Management**: Monitor and optimize memory usage
- **Database Indexing**: Ensure proper indexes for notification queries

---

## 🎯 Acceptance Criteria Met

- ✅ **Notifications queued**: Email and push notifications queued successfully
- ✅ **Retry on failure**: Exponential backoff with jitter implemented
- ✅ **Delivery status tracked**: Real-time status updates in database
- ✅ **Bull queue used**: Robust queue management with BullMQ
- ✅ **Logs stored in DB**: Comprehensive logging and audit trail
- ✅ **Priority support**: Job prioritization (1-10 scale)
- ✅ **Admin endpoints**: Queue management and monitoring APIs
- ✅ **Graceful shutdown**: Signal handling and clean termination
- ✅ **Health monitoring**: Built-in health checks and metrics

The notification worker system is production-ready and provides a solid foundation for reliable, scalable notification delivery.
