import { exec } from 'child_process';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import { ensureBackupDir, rotateBackups, BACKUP_DIR } from '../utils/backupUtils.js';
import hasPermission from '../middleware/rbac.js';
import protect from '../middleware/authMiddleware.js';
import mongoose from 'mongoose';

// Multer setup for restore endpoints
const upload = multer({
  dest: BACKUP_DIR,
  limits: { fileSize: 1024 * 1024 * 100 }, // 100MB max
});

// POST /admin/backups
export const backupDatabase = async (req, res) => {
  try {
    ensureBackupDir();
    rotateBackups(7);
    const timestamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15);
    const fileName = `dump-${timestamp}.archive`;
    const filePath = path.join(BACKUP_DIR, fileName);
    const mongoUri = process.env.MONGO_URI;
    const dumpCmd = `mongodump --uri=\"${mongoUri}\" --archive=\"${filePath}\" --gzip`;
    exec(dumpCmd, (error, stdout, stderr) => {
      if (error) {
        return res.status(500).json({
          error: req.t('error_internal', { defaultValue: 'Backup failed' }),
          details: stderr,
        });
      }
      return res.json({ file: fileName });
    });
  } catch (err) {
    res.status(500).json({
      error: req.t('error_internal', { defaultValue: 'Backup error' }),
      details: err.message,
    });
  }
};

// POST /admin/restore
export const restoreDatabase = [
  upload.single('dump'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ error: req.t('error_not_found', { defaultValue: 'No file uploaded' }) });
      }
      const filePath = req.file.path;
      const mongoUri = process.env.MONGO_URI;
      const restoreCmd = `mongorestore --uri=\"${mongoUri}\" --archive=\"${filePath}\" --gzip --drop`;
      exec(restoreCmd, async (error, stdout, stderr) => {
        if (error) {
          return res.status(500).json({
            error: req.t('error_internal', { defaultValue: 'Restore failed' }),
            details: stderr,
          });
        }
        // Test: try to find a user record
        const user = await mongoose.connection.db.collection('users').findOne();
        if (!user) {
          return res.status(500).json({
            error: req.t('error_internal', {
              defaultValue: 'Restore verification failed: no user found',
            }),
          });
        }
        return res.json({
          success: true,
          message: req.t('success', { defaultValue: 'Database restored' }),
        });
      });
    } catch (err) {
      res.status(500).json({
        error: req.t('error_internal', { defaultValue: 'Restore error' }),
        details: err.message,
      });
    }
  },
];
