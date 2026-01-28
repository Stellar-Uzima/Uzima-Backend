import request from 'supertest';
import mongoose from 'mongoose';
import app from '../index.js';
import Backup from '../models/Backup.js';
import BackupService from '../services/backupService.js';
import { generateToken } from '../utils/generateToken.js';
import User from '../models/User.js';

// Mock AWS S3 to avoid actual S3 calls during testing
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');

describe('Backup Service Tests', () => {
  let adminToken;
  let adminUser;
  let backupService;

  beforeAll(async () => {
    // Create admin user for testing
    adminUser = new User({
      email: 'admin@test.com',
      password: 'hashedpassword',
      role: 'admin',
      firstName: 'Admin',
      lastName: 'User',
    });
    await adminUser.save();

    adminToken = generateToken(adminUser._id);

    // Mock environment variables
    process.env.AWS_ACCESS_KEY_ID = 'test-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
    process.env.S3_BACKUP_BUCKET = 'test-bucket';
    process.env.BACKUP_ENCRYPTION_KEY = '12345678901234567890123456789012';
    process.env.BACKUP_RETENTION_DAYS = '30';

    backupService = new BackupService();
  });

  afterAll(async () => {
    await User.deleteMany({});
    await Backup.deleteMany({});
  });

  beforeEach(async () => {
    await Backup.deleteMany({});
  });

  describe('Backup Model', () => {
    test('should create backup record with required fields', async () => {
      const retentionDate = new Date();
      retentionDate.setDate(retentionDate.getDate() + 30);

      const backup = new Backup({
        backupId: 'test-backup-1',
        status: 'pending',
        database: 'test-db',
        retentionDate,
      });

      await backup.save();

      expect(backup.backupId).toBe('test-backup-1');
      expect(backup.status).toBe('pending');
      expect(backup.database).toBe('test-db');
    });

    test('should mark backup as completed', async () => {
      const backup = new Backup({
        backupId: 'test-backup-2',
        status: 'in_progress',
        database: 'test-db',
        retentionDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      await backup.save();

      await backup.markCompleted('s3://bucket/key', 'hash123', 1024);

      expect(backup.status).toBe('completed');
      expect(backup.s3Key).toBe('s3://bucket/key');
      expect(backup.hash).toBe('hash123');
      expect(backup.size).toBe(1024);
      expect(backup.completedAt).toBeDefined();
    });

    test('should mark backup as failed', async () => {
      const backup = new Backup({
        backupId: 'test-backup-3',
        status: 'in_progress',
        database: 'test-db',
        retentionDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      await backup.save();

      await backup.markFailed('Test error message');

      expect(backup.status).toBe('failed');
      expect(backup.errorMessage).toBe('Test error message');
      expect(backup.completedAt).toBeDefined();
    });
  });

  describe('Backup API Endpoints', () => {
    test('GET /api/admin/backups should return backup list for admin', async () => {
      // Create test backup records
      await Backup.create([
        {
          backupId: 'backup-1',
          status: 'completed',
          database: 'test-db',
          retentionDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        {
          backupId: 'backup-2',
          status: 'failed',
          database: 'test-db',
          retentionDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      ]);

      const response = await request(app)
        .get('/api/admin/backups')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.backups).toHaveLength(2);
      expect(response.body.data.pagination).toBeDefined();
    });

    test('GET /api/admin/backups/stats should return backup statistics', async () => {
      // Create test backup records
      await Backup.create([
        {
          backupId: 'backup-1',
          status: 'completed',
          database: 'test-db',
          size: 1024,
          retentionDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        {
          backupId: 'backup-2',
          status: 'failed',
          database: 'test-db',
          retentionDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      ]);

      const response = await request(app)
        .get('/api/admin/backups/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.totalBackups).toBe(2);
      expect(response.body.data.statusCounts).toBeDefined();
    });

    test('POST /api/admin/backups/trigger should trigger manual backup', async () => {
      const response = await request(app)
        .post('/api/admin/backups/trigger')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(202);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('triggered successfully');
    });

    test('GET /api/admin/backups/:backupId should return specific backup details', async () => {
      const backup = await Backup.create({
        backupId: 'backup-detail-test',
        status: 'completed',
        database: 'test-db',
        s3Key: 's3://bucket/backup-detail-test.tar.gz.enc',
        hash: 'hash123',
        size: 2048,
        retentionDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      const response = await request(app)
        .get(`/api/admin/backups/${backup.backupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.backupId).toBe('backup-detail-test');
      expect(response.body.data.status).toBe('completed');
    });

    test('DELETE /api/admin/backups/:backupId should delete backup', async () => {
      const backup = await Backup.create({
        backupId: 'backup-delete-test',
        status: 'completed',
        database: 'test-db',
        retentionDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      const response = await request(app)
        .delete(`/api/admin/backups/${backup.backupId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify backup is deleted from database
      const deletedBackup = await Backup.findOne({ backupId: 'backup-delete-test' });
      expect(deletedBackup).toBeNull();
    });

    test('should reject unauthorized access', async () => {
      await request(app).get('/api/admin/backups').expect(401);
    });
  });

  describe('BackupService Unit Tests', () => {
    test('should extract database name from MongoDB URI', () => {
      const mongoUri = 'mongodb://localhost:27017/testdb';
      const dbName = backupService.extractDatabaseName(mongoUri);
      expect(dbName).toBe('testdb');
    });

    test('should extract backup ID from S3 key', () => {
      const s3Key = 'mongodb-backups/backup-2023-12-01T10-00-00-000Z.tar.gz.enc';
      const backupId = backupService.extractBackupIdFromKey(s3Key);
      expect(backupId).toBe('backup-2023-12-01T10-00-00-000Z');
    });

    test('should validate encryption key length', () => {
      expect(() => {
        new BackupService();
      }).not.toThrow();

      // Test with invalid key length
      const originalKey = process.env.BACKUP_ENCRYPTION_KEY;
      process.env.BACKUP_ENCRYPTION_KEY = 'short';

      expect(() => {
        new BackupService();
      }).toThrow('BACKUP_ENCRYPTION_KEY must be exactly 32 characters');

      // Restore original key
      process.env.BACKUP_ENCRYPTION_KEY = originalKey;
    });
  });

  describe('Backup Statistics', () => {
    test('should calculate backup statistics correctly', async () => {
      await Backup.create([
        {
          backupId: 'stat-backup-1',
          status: 'completed',
          database: 'test-db',
          size: 1000,
          retentionDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        {
          backupId: 'stat-backup-2',
          status: 'completed',
          database: 'test-db',
          size: 2000,
          retentionDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        {
          backupId: 'stat-backup-3',
          status: 'failed',
          database: 'test-db',
          retentionDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      ]);

      const stats = await Backup.getBackupStats();

      expect(stats.totalBackups).toBe(3);
      expect(stats.statusCounts).toHaveLength(2); // completed and failed
      expect(stats.recentBackups).toHaveLength(3);
    });
  });
});
