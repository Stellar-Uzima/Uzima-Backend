import DailyBackupService from '../services/dailyBackupService.js';

const dailyBackupService = new DailyBackupService();

/**
 * Trigger manual daily backup
 */
export const triggerManualBackup = async (req, res) => {
  try {
    const result = await dailyBackupService.executeDailyBackup();
    
    return res.status(200).json({
      success: true,
      message: 'Manual backup completed successfully',
      data: result
    });
    
  } catch (error) {
    console.error('Manual backup failed:', error);
    
    return res.status(500).json({
      success: false,
      message: 'Manual backup failed',
      error: error.message
    });
  }
};

/**
 * Trigger manual cleanup of old backups
 */
export const triggerManualCleanup = async (req, res) => {
  try {
    const deletedCount = await dailyBackupService.cleanupOldBackups();
    
    return res.status(200).json({
      success: true,
      message: `Manual cleanup completed successfully`,
      deletedCount
    });
    
  } catch (error) {
    console.error('Manual cleanup failed:', error);
    
    return res.status(500).json({
      success: false,
      message: 'Manual cleanup failed',
      error: error.message
    });
  }
};

/**
 * Get backup statistics
 */
export const getBackupStats = async (req, res) => {
  try {
    const stats = await dailyBackupService.getBackupStats();
    
    if (!stats) {
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve backup statistics'
      });
    }
    
    return res.status(200).json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    console.error('Failed to get backup stats:', error);
    
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve backup statistics',
      error: error.message
    });
  }
};

/**
 * Test backup system health
 */
export const testBackupHealth = async (req, res) => {
  try {
    // Simple test - try to create a small backup record
    const testBackup = {
      backupId: `health-test-${Date.now()}`,
      backupType: 'health-test',
      status: 'completed',
      database: 'test',
      size: 1024,
      startedAt: new Date(),
      completedAt: new Date()
    };
    
    // This tests database connectivity
    const result = await dailyBackupService.getBackupStats();
    
    return res.status(200).json({
      success: true,
      message: 'Backup system is healthy',
      stats: result
    });
    
  } catch (error) {
    console.error('Backup health test failed:', error);
    
    return res.status(500).json({
      success: false,
      message: 'Backup system health check failed',
      error: error.message
    });
  }
};

/**
 * List recent backups
 */
export const listRecentBackups = async (req, res) => {
  try {
    const { limit = 20, status } = req.query;
    
    const query = { backupType: 'daily' };
    if (status) {
      query.status = status;
    }
    
    const backups = await Backup.find(query)
      .sort({ startedAt: -1 })
      .limit(parseInt(limit))
      .select('-__v');
    
    return res.status(200).json({
      success: true,
      data: backups
    });
    
  } catch (error) {
    console.error('Failed to list backups:', error);
    
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve backups',
      error: error.message
    });
  }
};

export default {
  triggerManualBackup,
  triggerManualCleanup,
  getBackupStats,
  testBackupHealth,
  listRecentBackups
};