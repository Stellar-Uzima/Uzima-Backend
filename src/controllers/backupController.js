import BackupService from '../services/backupService.js';
import Backup from '../models/Backup.js';
import { triggerManualBackup, getBackupStats } from '../cron/backupJob.js';
import ApiResponse from '../utils/apiResponse.js';

const backupService = new BackupService();

/**
 * Get list of all backups
 * GET /api/admin/backups
 */
export const getBackups = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    
    // Build query filter
    const filter = {};
    if (status) {
      filter.status = status;
    }
    
    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    // Get paginated backups from database
    const skip = (page - 1) * limit;
    const backups = await Backup.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .select('-__v');
    
    const totalCount = await Backup.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / limit);
    
    // Get S3 backup list for additional details
    const s3Backups = await backupService.listBackups();
    
    // Merge database and S3 information
    const enrichedBackups = backups.map(backup => {
      const s3Info = s3Backups.find(s3 => s3.backupId === backup.backupId);
      return {
        ...backup.toObject(),
        s3Info: s3Info || null,
        downloadUrl: s3Info ? s3Info.url : null
      };
    });
    
    return ApiResponse(res, 200, 'Backups retrieved successfully', {
      backups: enrichedBackups,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalCount,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
    
  } catch (error) {
    console.error('Error retrieving backups:', error);
    return ApiResponse(res, 500, 'Failed to retrieve backups', null, error.message);
  }
};

/**
 * Get backup statistics
 * GET /api/admin/backups/stats
 */
export const getBackupStatistics = async (req, res) => {
  try {
    const stats = await getBackupStats();
    
    // Additional statistics
    const additionalStats = {
      storageUsed: await calculateTotalStorageUsed(),
      averageBackupSize: await calculateAverageBackupSize(),
      successRate: await calculateSuccessRate(),
      lastBackupTime: await getLastBackupTime()
    };
    
    return ApiResponse(res, 200, 'Backup statistics retrieved successfully', {
      ...stats,
      ...additionalStats
    });
    
  } catch (error) {
    console.error('Error retrieving backup statistics:', error);
    return ApiResponse(res, 500, 'Failed to retrieve backup statistics', null, error.message);
  }
};

/**
 * Get specific backup details
 * GET /api/admin/backups/:backupId
 */
export const getBackupDetails = async (req, res) => {
  try {
    const { backupId } = req.params;
    
    const backup = await Backup.findOne({ backupId }).select('-__v');
    if (!backup) {
      return ApiResponse(res, 404, 'Backup not found');
    }
    
    // Get S3 information
    const s3Backups = await backupService.listBackups();
    const s3Info = s3Backups.find(s3 => s3.backupId === backupId);
    
    // Verify backup integrity if not already verified
    let verificationResult = null;
    if (backup.s3Key && !backup.verificationStatus.verified) {
      verificationResult = await backupService.verifyBackupIntegrity(backup.s3Key);
      if (verificationResult.verified) {
        await backup.markVerified(backup.hash);
      }
    }
    
    return ApiResponse(res, 200, 'Backup details retrieved successfully', {
      ...backup.toObject(),
      s3Info: s3Info || null,
      downloadUrl: s3Info ? s3Info.url : null,
      verificationResult
    });
    
  } catch (error) {
    console.error('Error retrieving backup details:', error);
    return ApiResponse(res, 500, 'Failed to retrieve backup details', null, error.message);
  }
};

/**
 * Trigger manual backup
 * POST /api/admin/backups/trigger
 */
export const triggerBackup = async (req, res) => {
  try {
    // Check if there's already a backup in progress
    const inProgressBackup = await Backup.findOne({ status: 'in_progress' });
    if (inProgressBackup) {
      return ApiResponse(res, 409, 'A backup is already in progress', {
        inProgressBackup: inProgressBackup.backupId
      });
    }
    
    // Trigger manual backup asynchronously
    triggerManualBackup().catch(error => {
      console.error('Manual backup failed:', error);
    });
    
    return ApiResponse(res, 202, 'Backup triggered successfully', {
      message: 'Backup has been started and will run in the background'
    });
    
  } catch (error) {
    console.error('Error triggering backup:', error);
    return ApiResponse(res, 500, 'Failed to trigger backup', null, error.message);
  }
};

/**
 * Delete a specific backup
 * DELETE /api/admin/backups/:backupId
 */
export const deleteBackup = async (req, res) => {
  try {
    const { backupId } = req.params;
    
    const backup = await Backup.findOne({ backupId });
    if (!backup) {
      return ApiResponse(res, 404, 'Backup not found');
    }
    
    // Delete from S3 if exists
    if (backup.s3Key) {
      await backupService.deleteBackup(backup.s3Key);
    }
    
    // Delete from database
    await Backup.deleteOne({ backupId });
    
    return ApiResponse(res, 200, 'Backup deleted successfully');
    
  } catch (error) {
    console.error('Error deleting backup:', error);
    return ApiResponse(res, 500, 'Failed to delete backup', null, error.message);
  }
};

/**
 * Verify backup integrity
 * POST /api/admin/backups/:backupId/verify
 */
export const verifyBackup = async (req, res) => {
  try {
    const { backupId } = req.params;
    
    const backup = await Backup.findOne({ backupId });
    if (!backup) {
      return ApiResponse(res, 404, 'Backup not found');
    }
    
    if (!backup.s3Key) {
      return ApiResponse(res, 400, 'Backup has no S3 key for verification');
    }
    
    const verificationResult = await backupService.verifyBackupIntegrity(backup.s3Key);
    
    if (verificationResult.verified) {
      await backup.markVerified(backup.hash);
    }
    
    return ApiResponse(res, 200, 'Backup verification completed', verificationResult);
    
  } catch (error) {
    console.error('Error verifying backup:', error);
    return ApiResponse(res, 500, 'Failed to verify backup', null, error.message);
  }
};

/**
 * Download backup file
 * GET /api/admin/backups/:backupId/download
 */
export const downloadBackup = async (req, res) => {
  try {
    const { backupId } = req.params;
    
    const backup = await Backup.findOne({ backupId });
    if (!backup) {
      return ApiResponse(res, 404, 'Backup not found');
    }
    
    if (!backup.s3Key) {
      return ApiResponse(res, 400, 'Backup file not available for download');
    }
    
    // Generate pre-signed URL for download (valid for 1 hour)
    const downloadUrl = await backupService.generateDownloadUrl(backup.s3Key, 3600);
    
    return ApiResponse(res, 200, 'Download URL generated successfully', {
      downloadUrl,
      expiresIn: 3600,
      filename: `${backupId}.tar.gz.enc`
    });
    
  } catch (error) {
    console.error('Error generating download URL:', error);
    return ApiResponse(res, 500, 'Failed to generate download URL', null, error.message);
  }
};

// Helper functions

async function calculateTotalStorageUsed() {
  const result = await Backup.aggregate([
    { $match: { status: 'completed' } },
    { $group: { _id: null, totalSize: { $sum: '$size' } } }
  ]);
  return result[0]?.totalSize || 0;
}

async function calculateAverageBackupSize() {
  const result = await Backup.aggregate([
    { $match: { status: 'completed' } },
    { $group: { _id: null, avgSize: { $avg: '$size' } } }
  ]);
  return result[0]?.avgSize || 0;
}

async function calculateSuccessRate() {
  const total = await Backup.countDocuments();
  const successful = await Backup.countDocuments({ status: 'completed' });
  return total > 0 ? (successful / total) * 100 : 0;
}

async function getLastBackupTime() {
  const lastBackup = await Backup.findOne({ status: 'completed' })
    .sort({ completedAt: -1 })
    .select('completedAt');
  return lastBackup?.completedAt || null;
}