import BackupService from '../services/backupService.js';
import FilteredBackupService from '../services/filteredBackupService.js';
import Backup from '../models/Backup.js';
import { triggerManualBackup, getBackupStats } from '../cron/backupJob.js';
import ApiResponse from '../utils/apiResponse.js';
import { createReadStream } from 'fs';
import path from 'path';

const backupService = new BackupService();
const filteredBackupService = new FilteredBackupService();

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
        downloadUrl: s3Info ? s3Info.url : null,
      };
    });

    return ApiResponse.success(
      res,
      {
        backups: enrichedBackups,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
      'success.BACKUPS_RETRIEVED',
      200
    );
  } catch (error) {
    console.error('Error retrieving backups:', error);
    return ApiResponse.error(res, error.message || 'Failed to retrieve backups', 500);
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
      lastBackupTime: await getLastBackupTime(),
    };

    return ApiResponse.success(
      res,
      {
        ...stats,
        ...additionalStats,
      },
      'success.STATS_RETRIEVED',
      200
    );
  } catch (error) {
    console.error('Error retrieving backup statistics:', error);
    return ApiResponse.error(res, error.message || 'Failed to retrieve backup statistics', 500);
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
      return ApiResponse.error(res, 'Backup not found', 404);
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

    return ApiResponse.success(
      res,
      {
        ...backup.toObject(),
        s3Info: s3Info || null,
        downloadUrl: s3Info ? s3Info.url : null,
        verificationResult,
      },
      'success.BACKUP_DETAILS_RETRIEVED',
      200
    );
  } catch (error) {
    console.error('Error retrieving backup details:', error);
    return ApiResponse.error(res, error.message || 'Failed to retrieve backup details', 500);
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
      return ApiResponse.error(res, 'A backup is already in progress', 409);
    }

    // Trigger manual backup asynchronously
    triggerManualBackup().catch(error => {
      console.error('Manual backup failed:', error);
    });

    return ApiResponse.success(
      res,
      {
        message: 'Backup has been started and will run in the background',
      },
      'success.BACKUP_TRIGGERED',
      202
    );
  } catch (error) {
    console.error('Error triggering backup:', error);
    return ApiResponse.error(res, error.message || 'Failed to trigger backup', 500);
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
      return ApiResponse.error(res, 'Backup not found', 404);
    }

    // Delete from S3 if exists
    if (backup.s3Key) {
      await backupService.deleteBackup(backup.s3Key);
    }

    // Delete from database
    await Backup.deleteOne({ backupId });

    return ApiResponse.success(res, {}, 'success.BACKUP_DELETED', 200);
  } catch (error) {
    console.error('Error deleting backup:', error);
    return ApiResponse.error(res, error.message || 'Failed to delete backup', 500);
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
      return ApiResponse.error(res, 'Backup not found', 404);
    }

    if (!backup.s3Key) {
      return ApiResponse.error(res, 'Backup has no S3 key for verification', 400);
    }

    const verificationResult = await backupService.verifyBackupIntegrity(backup.s3Key);

    if (verificationResult.verified) {
      await backup.markVerified(backup.hash);
    }

    return ApiResponse.success(res, verificationResult, 'success.BACKUP_VERIFIED', 200);
  } catch (error) {
    console.error('Error verifying backup:', error);
    return ApiResponse.error(res, error.message || 'Failed to verify backup', 500);
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
      return ApiResponse.error(res, 'Backup not found', 404);
    }

    if (!backup.s3Key) {
      return ApiResponse.error(res, 'Backup file not available for download', 400);
    }

    // Generate pre-signed URL for download (valid for 1 hour)
    const downloadUrl = await backupService.generateDownloadUrl(backup.s3Key, 3600);

    return ApiResponse.success(
      res,
      {
        downloadUrl,
        expiresIn: 3600,
        filename: `${backupId}.tar.gz.enc`,
      },
      'success.DOWNLOAD_URL_GENERATED',
      200
    );
  } catch (error) {
    console.error('Error generating download URL:', error);
    return ApiResponse.error(res, error.message || 'Failed to generate download URL', 500);
  }
};

// Helper functions

async function calculateTotalStorageUsed() {
  const result = await Backup.aggregate([
    { $match: { status: 'completed' } },
    { $group: { _id: null, totalSize: { $sum: '$size' } } },
  ]);
  return result[0]?.totalSize || 0;
}

async function calculateAverageBackupSize() {
  const result = await Backup.aggregate([
    { $match: { status: 'completed' } },
    { $group: { _id: null, avgSize: { $avg: '$size' } } },
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

/**
 * Create filtered backup with advanced options
 * POST /api/admin/backups/create
 * Body: {
 *   collections: ['users', 'records', ...],
 *   filters: {
 *     startDate: '2024-01-01',
 *     endDate: '2024-12-31',
 *     recordTypes: ['prescription', 'vital'],
 *     userId: 'user-id',
 *     status: ['active', 'completed']
 *   },
 *   format: 'json' | 'csv' | 'both'
 * }
 */
export const createFilteredBackup = async (req, res) => {
  try {
    const { collections, filters = {}, format = 'both' } = req.body;

    // Validation
    if (!collections || !Array.isArray(collections) || collections.length === 0) {
      return ApiResponse.error(res, 'Collections array is required and cannot be empty', 400);
    }

    if (!['json', 'csv', 'both'].includes(format)) {
      return ApiResponse.error(res, 'Invalid format. Must be one of: json, csv, both', 400);
    }

    // Parse date filters
    const processedFilters = {
      ...filters,
      startDate: filters.startDate ? new Date(filters.startDate) : null,
      endDate: filters.endDate ? new Date(filters.endDate) : null,
    };

    // Create the filtered backup
    const backupResult = await filteredBackupService.createFilteredBackup(
      collections,
      processedFilters,
      format
    );

    // Store backup record in database
    const backupRecord = new Backup({
      backupId: backupResult.backupId,
      status: 'completed',
      backupCategory: 'filtered',
      database: 'filtered-export',
      backupType: 'full',
      startedAt: backupResult.startTime,
      completedAt: backupResult.endTime,
      metadata: {
        collections: collections.map(name => ({
          name,
          documentCount: backupResult.metadata.recordCounts?.[name] || 0,
          size: backupResult.files.json?.size || 0,
        })),
        totalDocuments: backupResult.metadata.totalRecords,
        totalSize: Object.values(backupResult.files).reduce((sum, f) => sum + (f.size || 0), 0),
      },
      filteredBackupMetadata: backupResult.metadata,
      filePaths: {
        jsonPath: backupResult.files.json?.path,
        csvPath: backupResult.files.csv?.path,
      },
      retentionDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days retention
    });

    try {
      await backupRecord.save();
      console.log('Backup record saved successfully:', backupResult.backupId);
    } catch (saveError) {
      console.error('Error saving backup record:', saveError.message);
      console.error('Backup data:', JSON.stringify(backupRecord, null, 2));
      throw saveError;
    }

    return ApiResponse.success(
      res,
      {
        backupId: backupResult.backupId,
        metadata: backupResult.metadata,
        files: backupResult.files,
        createdAt: backupResult.startTime,
        duration: `${backupResult.duration}ms`,
      },
      'success.BACKUP_CREATED',
      201
    );
  } catch (error) {
    console.error('Error creating filtered backup:', error);
    return ApiResponse.error(res, error.message || 'Failed to create filtered backup', 500);
  }
};

/**
 * Get filtered backups list
 * GET /api/admin/backups/filtered
 */
export const getFilteredBackups = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const backups = await Backup.find({ backupCategory: 'filtered' })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(parseInt(limit))
      .select('-__v');

    const total = await Backup.countDocuments({ backupCategory: 'filtered' });

    return ApiResponse.success(
      res,
      {
        backups,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          total,
          limit: parseInt(limit),
        },
      },
      'success.BACKUPS_RETRIEVED',
      200
    );
  } catch (error) {
    console.error('Error retrieving filtered backups:', error);
    return ApiResponse.error(res, error.message || 'Failed to retrieve filtered backups', 500);
  }
};

/**
 * Download filtered backup file
 * GET /api/admin/backups/:backupId/download
 * Query: ?format=json|csv
 */
export const downloadFilteredBackup = async (req, res) => {
  try {
    const { backupId } = req.params;
    const { format = 'json' } = req.query;

    if (!['json', 'csv'].includes(format)) {
      return ApiResponse.error(res, 'Invalid format. Must be json or csv', 400);
    }

    // Get backup metadata
    const backup = await Backup.findOne({ backupId, backupCategory: 'filtered' });
    if (!backup) {
      return ApiResponse.error(res, 'Filtered backup not found', 404);
    }

    // Get file
    const fileInfo = await filteredBackupService.getBackupFile(backupId, format);

    // Stream file to response
    const fileStream = createReadStream(fileInfo.path);

    // Set response headers for file download
    res.setHeader('Content-Type', format === 'json' ? 'application/json' : 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.fileName}"`);
    res.setHeader('Content-Length', fileInfo.size);

    // Stream the file
    fileStream.pipe(res);

    fileStream.on('error', error => {
      console.error('Error streaming backup file:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Error downloading file',
          error: error.message,
        });
      }
    });
  } catch (error) {
    console.error('Error downloading filtered backup:', error);
    if (!res.headersSent) {
      return ApiResponse.error(res, error.message || 'Failed to download backup', 500);
    }
  }
};

/**
 * Get filtered backup metadata
 * GET /api/admin/backups/:backupId/metadata
 */
export const getFilteredBackupMetadata = async (req, res) => {
  try {
    const { backupId } = req.params;

    const backup = await Backup.findOne({ backupId, backupCategory: 'filtered' });
    if (!backup) {
      return ApiResponse.error(res, 'Filtered backup not found', 404);
    }

    return ApiResponse.success(
      res,
      {
        backupId,
        createdAt: backup.createdAt,
        format: backup.filteredBackupMetadata.format,
        filters: backup.filteredBackupMetadata.filters,
        collections: backup.filteredBackupMetadata.collections,
        recordCounts: backup.filteredBackupMetadata.recordCounts,
        totalRecords: backup.filteredBackupMetadata.totalRecords,
        filtersApplied: backup.filteredBackupMetadata.filtersApplied,
        size: backup.metadata.totalSize,
      },
      'success.METADATA_RETRIEVED',
      200
    );
  } catch (error) {
    console.error('Error retrieving backup metadata:', error);
    return ApiResponse.error(res, error.message || 'Failed to retrieve backup metadata', 500);
  }
};

/**
 * Delete filtered backup
 * DELETE /api/admin/backups/:backupId/filtered
 */
export const deleteFilteredBackup = async (req, res) => {
  try {
    const { backupId } = req.params;

    const backup = await Backup.findOne({ backupId, backupCategory: 'filtered' });
    if (!backup) {
      return ApiResponse.error(res, 'Filtered backup not found', 404);
    }

    // Delete files
    await filteredBackupService.deleteFilteredBackup(backupId);

    // Delete database record
    await Backup.deleteOne({ backupId });

    return ApiResponse.success(res, {}, 'success.BACKUP_DELETED', 200);
  } catch (error) {
    console.error('Error deleting filtered backup:', error);
    return ApiResponse.error(res, error.message || 'Failed to delete filtered backup', 500);
  }
};
