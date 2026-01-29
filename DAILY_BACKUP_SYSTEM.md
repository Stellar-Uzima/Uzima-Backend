# Automated Daily Database Backup System

## Overview
This implementation provides a robust automated daily database backup system with retention policies, compression, S3 storage, and email notifications.

## Features Implemented

### ✅ Core Requirements Met
- **Daily backups at 3 AM server time** using node-cron
- **MongoDB dumps** using mongodump with gzip compression
- **S3 storage** with AWS SDK integration
- **30-day retention policy** with automatic cleanup
- **Email notifications** for success/failure events
- **Compression** using tar.gz format

### ✅ Additional Features
- Manual backup triggering via API
- Backup statistics and reporting
- Health checks and monitoring
- Role-based access control (admin only)
- Comprehensive logging
- Graceful error handling

## System Architecture

### Components

1. **DailyBackupService** (`src/services/dailyBackupService.js`)
   - Core backup logic and orchestration
   - S3 integration and file management
   - Email notification system
   - Backup record management

2. **Daily Backup Cron Job** (`src/cron/dailyBackupJob.js`)
   - Scheduled execution at 3 AM daily
   - Automatic cleanup of old backups at 4 AM
   - Weekly statistics reports on Sundays
   - Monthly health checks

3. **Backup Controller** (`src/controllers/dailyBackupController.js`)
   - Manual backup triggering
   - Backup statistics retrieval
   - Health check endpoints
   - Backup listing functionality

4. **Backup Routes** (`src/routes/dailyBackupRoutes.js`)
   - RESTful API endpoints
   - Authentication and authorization
   - Admin-only access control

## Cron Job Schedule

| Time | Job | Description |
|------|-----|-------------|
| 3:00 AM | Daily Backup | Execute mongodump and upload to S3 |
| 4:00 AM | Cleanup | Remove backups older than 30 days |
| Sunday 5:00 AM | Stats Report | Generate backup statistics |
| 1st of Month 6:00 AM | Health Check | Verify backup system functionality |

## API Endpoints

### Authentication Required: Admin Role

```
POST /api/backups/manual     - Trigger manual backup
POST /api/backups/cleanup    - Trigger manual cleanup
GET  /api/backups/stats      - Get backup statistics
GET  /api/backups/health     - Test backup system health
GET  /api/backups/list       - List recent backups
```

## Environment Variables Required

```bash
# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1
S3_BACKUP_BUCKET=uzima-backups
S3_BACKUP_PREFIX=daily-backups/

# Backup Configuration
BACKUP_RETENTION_DAYS=30
MONGO_URI=mongodb://localhost:27017/your_database

# Email Configuration
RESEND_API_KEY=your_resend_api_key
ADMIN_EMAILS=admin@yourcompany.com,backup-admin@yourcompany.com
```

## Backup Process Flow

1. **Initialization**
   - Create backup directory
   - Generate unique backup ID with timestamp

2. **Database Dump**
   - Execute `mongodump` with `--gzip` flag
   - Create compressed archive locally

3. **S3 Upload**
   - Upload compressed backup to S3 bucket
   - Store with organized folder structure
   - Add metadata for tracking

4. **Database Record**
   - Save backup details to MongoDB
   - Track status, size, timestamps
   - Store S3 key for future restoration

5. **Cleanup**
   - Remove local temporary files
   - Free up disk space

6. **Notification**
   - Send email alert on success/failure
   - Include backup details and statistics

## Retention Policy

- **Default retention**: 30 days
- **Automatic cleanup**: Runs daily at 4 AM
- **Cleanup criteria**: Backups older than retention period
- **Safety measures**: Only deletes completed backups

## Email Notifications

### Success Notification
- ✅ Daily Database Backup Successful
- Backup ID and timestamp
- File size information
- Confirmation of S3 storage

### Failure Notification
- ❌ Daily Database Backup Failed
- Error details and timestamp
- Immediate attention required
- Troubleshooting guidance

### Cleanup Notification
- 🧹 Backup Cleanup Completed
- Number of deleted backups
- Retention policy information

## Monitoring and Health Checks

### Built-in Health Checks
- S3 connectivity verification
- Database record creation
- File system permissions
- Network availability

### Statistics Tracking
- Total backup count
- Success/failure rates
- Storage usage
- Recent backup history

## Error Handling

### Robust Error Management
- Detailed error logging
- Graceful degradation
- Retry mechanisms
- Alert escalation

### Recovery Procedures
- Manual backup triggering
- Backup restoration procedures
- System health diagnostics

## Security Considerations

### Access Control
- Admin-only API endpoints
- JWT authentication required
- Role-based authorization

### Data Protection
- Encrypted S3 transfers
- Secure credential management
- Private backup storage

## Testing

### Manual Testing Commands
```bash
# Trigger manual backup
curl -X POST http://localhost:3000/api/backups/manual \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Check backup statistics
curl -X GET http://localhost:3000/api/backups/stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Test system health
curl -X GET http://localhost:3000/api/backups/health \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Deployment Checklist

- [ ] Configure AWS S3 credentials
- [ ] Set backup retention period
- [ ] Configure admin email addresses
- [ ] Test manual backup functionality
- [ ] Verify cron job scheduling
- [ ] Test email notifications
- [ ] Monitor initial backup execution
- [ ] Validate retention policy cleanup

## Troubleshooting

### Common Issues

1. **Backup fails to start**
   - Check MongoDB connectivity
   - Verify mongodump installation
   - Confirm S3 credentials

2. **S3 upload failures**
   - Validate AWS permissions
   - Check bucket existence
   - Verify network connectivity

3. **Email notifications not sending**
   - Confirm Resend API key
   - Check admin email configuration
   - Verify email service availability

4. **Retention cleanup issues**
   - Review backup records in database
   - Check S3 object permissions
   - Validate retention date calculations

## Future Enhancements

- [ ] Incremental backup support
- [ ] Backup encryption at rest
- [ ] Multi-region S3 replication
- [ ] Backup restoration interface
- [ ] Performance monitoring dashboard
- [ ] Backup compression optimization