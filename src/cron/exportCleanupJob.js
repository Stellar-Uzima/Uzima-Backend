import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RETENTION_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const exportsDir = path.join(__dirname, '../../exports');

/**
 * Clean up old export files that are older than RETENTION_DAYS
 */
export const cleanupOldExports = async () => {
  try {
    console.log('Starting export cleanup job...');

    // Ensure exports directory exists
    if (!fs.existsSync(exportsDir)) {
      console.log('Exports directory does not exist, skipping cleanup');
      return;
    }

    const cutoffTime = Date.now() - RETENTION_DAYS * MS_PER_DAY;
    let deletedCount = 0;

    // Read all files in exports directory
    const files = fs.readdirSync(exportsDir);

    for (const file of files) {
      const filePath = path.join(exportsDir, file);
      const stats = fs.statSync(filePath);

      // Check if file is older than retention period
      if (stats.mtime.getTime() < cutoffTime) {
        fs.unlinkSync(filePath);
        deletedCount++;
        console.log(`Deleted old export file: ${file}`);
      }
    }

    console.log(`Export cleanup completed. Deleted ${deletedCount} old files.`);
    return { deletedCount };
  } catch (error) {
    console.error('Error during export cleanup:', error);
    throw error;
  }
};

/**
 * Get statistics about export files
 */
export const getExportStats = () => {
  try {
    if (!fs.existsSync(exportsDir)) {
      return { totalFiles: 0, totalSize: 0, oldestFile: null };
    }

    const files = fs.readdirSync(exportsDir);
    let totalSize = 0;
    let oldestFile = null;
    let oldestTime = Date.now();

    for (const file of files) {
      const filePath = path.join(exportsDir, file);
      const stats = fs.statSync(filePath);
      totalSize += stats.size;

      if (stats.mtime.getTime() < oldestTime) {
        oldestTime = stats.mtime.getTime();
        oldestFile = file;
      }
    }

    return {
      totalFiles: files.length,
      totalSize,
      oldestFile,
      oldestFileDate: oldestFile ? new Date(oldestTime) : null,
    };
  } catch (error) {
    console.error('Error getting export stats:', error);
    return { totalFiles: 0, totalSize: 0, oldestFile: null, error: error.message };
  }
};

// Schedule the cleanup job to run daily at 2 AM
cron.schedule('0 2 * * *', cleanupOldExports, {
  scheduled: true,
  timezone: 'UTC',
});

console.log('Export cleanup job scheduled to run daily at 2 AM UTC');

// For manual execution
export const executeCleanup = cleanupOldExports;
