# Automated Backup System

## Overview

The Uzima Backend now includes a comprehensive automated backup system that provides:
- Daily automated MongoDB backups
- Encrypted backup storage in AWS S3
- Backup integrity verification
- Admin API for backup management
- Configurable retention policies
- Disaster recovery capabilities

## Features

### ✅ Automated Daily Backups
- Scheduled daily full backups using node-cron (default: 2:00 AM UTC)
- Scheduled hourly incremental backups (default: every hour)
- Configurable schedules via environment variables
- Automatic cleanup of old backups based on retention policy

### ✅ Security & Encryption
- All backup files are encrypted using AES-256-GCM before upload
- Sensitive data protection with configurable encryption keys
- Secure S3 storage with server-side encryption

### ✅ Cloud Storage Integration
- AWS S3 integration for reliable cloud storage
- Configurable bucket and prefix settings
- Pre-signed URLs for secure download access

### ✅ Backup Integrity Verification
- SHA-256 hash verification for backup integrity
- Automatic verification after backup completion
- Manual verification endpoints for admins

### ✅ Admin Management Interface
- RESTful API endpoints for backup management
- List, view, download, and delete backups
- Backup statistics and monitoring
- Manual backup triggering

### ✅ Monitoring & Logging
- Comprehensive logging for all backup operations
- Backup status tracking in MongoDB
- Automated alert system with email notifications
- Backup health checks every 6 hours
- Performance metrics and statistics

### ✅ Automated Restore Testing
- Quarterly automated restore testing to staging environment
- Full backup chain testing (full + incremental)
- Data integrity validation after restore
- Comprehensive test reporting and notifications

### ✅ Advanced Alert System
- Backup failure notifications with cooldown periods
- Storage quota warnings (80% threshold)
- Integrity verification failure alerts
- Quarterly test result notifications
- Configurable admin email recipients

## Configuration

### Environment Variables

Add the following variables to your `.env` file:

```env
# AWS S3 Configuration for Backups
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1
S3_BACKUP_BUCKET=uzima-backups
S3_BACKUP_PREFIX=mongodb-backups/

# Backup Configuration
BACKUP_RETENTION_DAYS=30
BACKUP_ENCRYPTION_KEY=your_backup_encryption_key_32_chars
BACKUP_SCHEDULE=0 2 * * *
INCREMENTAL_BACKUP_SCHEDULE=0 * * * *
BACKUP_STORAGE_LIMIT_GB=100

# Staging Environment for Restore Testing
STAGING_MONGO_URI=mongodb://localhost:27017/uzima-staging

# Alert Configuration
BACKUP_ADMIN_EMAILS=admin1@uzima.com,admin2@uzima.com
ADMIN_EMAIL=admin@uzima.com
```

### AWS S3 Setup

1. Create an S3 bucket for backups
2. Configure IAM user with appropriate permissions:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "s3:GetObject",
           "s3:PutObject",
           "s3:DeleteObject",
           "s3:ListBucket"
         ],
         "Resource": [
           "arn:aws:s3:::uzima-backups",
           "arn:aws:s3:::uzima-backups/*"
         ]
       }
     ]
   }
   ```

## API Endpoints

### Admin Backup Management

All backup endpoints require admin authentication and are prefixed with `/api/admin/backups`.

#### List Backups
```http
GET /api/admin/backups
```
Query parameters:
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)
- `status`: Filter by status (pending, in_progress, completed, failed)
- `sortBy`: Sort field (default: createdAt)
- `sortOrder`: Sort order (asc, desc)

#### Get Backup Statistics
```http
GET /api/admin/backups/stats
```

#### Get Backup Details
```http
GET /api/admin/backups/{backupId}
```

#### Trigger Manual Backup
```http
POST /api/admin/backups/trigger
```

#### Download Backup
```http
GET /api/admin/backups/{backupId}/download
```

#### Verify Backup Integrity
```http
POST /api/admin/backups/{backupId}/verify
```

#### Delete Backup
```http
DELETE /api/admin/backups/{backupId}
```

## Database Schema

### Backup Model

```javascript
{
  backupId: String,           // Unique backup identifier
  status: String,             // pending, in_progress, completed, failed
  database: String,           // Database name
  s3Key: String,             // S3 object key
  hash: String,              // SHA-256 hash for integrity
  size: Number,              // Backup file size in bytes
  startedAt: Date,           // Backup start time
  completedAt: Date,         // Backup completion time
  errorMessage: String,      // Error message if failed
  metadata: {                // Backup metadata
    collections: Array,
    totalDocuments: Number,
    totalSize: Number,
    compressionRatio: Number
  },
  retentionDate: Date,       // Automatic deletion date
  verificationStatus: {      // Integrity verification
    verified: Boolean,
    verifiedAt: Date,
    verificationHash: String
  }
}
```

## Backup Process

### 1. Backup Creation
1. Generate unique backup ID with timestamp
2. Create temporary directory for backup files
3. Execute `mongodump` to export MongoDB data
4. Compress exported data into archive
5. Encrypt archive using AES-256-GCM
6. Calculate SHA-256 hash for integrity verification
7. Upload encrypted file to S3
8. Update backup record in database
9. Clean up temporary files

### 2. Integrity Verification
1. Download backup file from S3 (optional)
2. Verify SHA-256 hash matches stored hash
3. Update verification status in database

### 3. Cleanup Process
1. List all backups older than retention period
2. Delete expired backups from S3
3. Remove expired backup records from database
4. Log cleanup statistics

## Monitoring

### Backup Statistics
- Total number of backups
- Success/failure rates
- Storage usage
- Average backup size
- Last backup time

### Logging
- All backup operations are logged with correlation IDs
- Error messages include detailed context
- Performance metrics are tracked

### Alerts
- Failed backup notifications
- Storage quota warnings
- Integrity verification failures

## Disaster Recovery

### Backup Restoration Process

1. **Download Backup**
   ```bash
   # Use the download API to get pre-signed URL
   curl -H "Authorization: Bearer $ADMIN_TOKEN" \
        "https://api.uzima.com/api/admin/backups/{backupId}/download"
   ```

2. **Decrypt Backup**
   ```bash
   # Decrypt the downloaded file
   openssl enc -d -aes-256-gcm -in backup.tar.gz.enc -out backup.tar.gz \
               -k $BACKUP_ENCRYPTION_KEY
   ```

3. **Extract and Restore**
   ```bash
   # Extract the backup
   tar -xzf backup.tar.gz
   
   # Restore to MongoDB
   mongorestore --uri="mongodb://localhost:27017/uzima" ./dump/uzima
   ```

### Recovery Testing
- Regular recovery drills should be performed
- Test restoration to staging environment
- Verify data integrity after restoration

## Performance Considerations

### Backup Size Optimization
- Use MongoDB compression features
- Implement incremental backups for large datasets
- Monitor backup file sizes and adjust retention accordingly

### Network Optimization
- Use S3 multipart uploads for large files
- Implement retry logic for network failures
- Consider regional S3 buckets for better performance

### Resource Management
- Schedule backups during low-traffic periods
- Monitor system resources during backup operations
- Implement backup throttling if needed

## Security Best Practices

### Encryption
- Use strong encryption keys (32 characters minimum)
- Rotate encryption keys regularly
- Store keys securely (AWS Secrets Manager, etc.)

### Access Control
- Limit S3 bucket access to backup service only
- Use IAM roles with minimal required permissions
- Enable S3 bucket versioning and MFA delete

### Monitoring
- Enable CloudTrail for S3 access logging
- Monitor backup access patterns
- Set up alerts for unusual activity

## Troubleshooting

### Common Issues

1. **Backup Fails with "mongodump not found"**
   - Install MongoDB tools on the server
   - Ensure mongodump is in the system PATH

2. **S3 Upload Fails**
   - Verify AWS credentials and permissions
   - Check S3 bucket exists and is accessible
   - Verify network connectivity to AWS

3. **Encryption Errors**
   - Ensure BACKUP_ENCRYPTION_KEY is exactly 32 characters
   - Verify encryption key is properly set in environment

4. **Large Backup Files**
   - Consider implementing incremental backups
   - Adjust S3 multipart upload settings
   - Monitor disk space on backup server

### Logs and Debugging
- Check application logs for detailed error messages
- Use correlation IDs to trace backup operations
- Monitor backup job status in database

## Testing

Run the backup system tests:

```bash
npm test -- backup.test.js
```

The test suite covers:
- Backup model functionality
- API endpoint authentication and authorization
- Backup service unit tests
- Statistics calculation
- Error handling scenarios

## Future Enhancements

### Planned Features
- Incremental backup support
- Cross-region backup replication
- Backup compression optimization
- Real-time backup monitoring dashboard
- Automated recovery testing
- Integration with monitoring systems (Prometheus, etc.)

### Performance Improvements
- Parallel backup processing
- Backup deduplication
- Streaming backup uploads
- Background verification processes