import fs from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import mongoose from 'mongoose';
import { Transform } from 'stream';
import { parse } from 'json2csv';

/**
 * Filtered Backup Export Service
 * Handles creation of backups with advanced filtering options and multiple export formats
 */
class FilteredBackupService {
  constructor() {
    this.tempDir = path.join(process.cwd(), 'temp', 'filtered-backups');
    this.exportDir = path.join(process.cwd(), 'backups', 'exports');
  }

  /**
   * Initialize required directories
   */
  async initializeDirectories() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
      await fs.mkdir(this.exportDir, { recursive: true });
    } catch (error) {
      console.error('Failed to initialize directories:', error);
      throw error;
    }
  }

  /**
   * Build MongoDB aggregation pipeline based on filters
   */
  buildAggregationPipeline(filters = {}) {
    const pipeline = [];

    // Date range filter
    if (filters.startDate || filters.endDate) {
      const dateFilter = {};
      if (filters.startDate) {
        dateFilter.$gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        dateFilter.$lte = new Date(filters.endDate);
      }
      pipeline.push({
        $match: {
          createdAt: dateFilter,
        },
      });
    }

    // Record types filter
    if (
      filters.recordTypes &&
      Array.isArray(filters.recordTypes) &&
      filters.recordTypes.length > 0
    ) {
      pipeline.push({
        $match: {
          recordType: { $in: filters.recordTypes },
        },
      });
    }

    // User-specific filter
    if (filters.userId) {
      pipeline.push({
        $match: {
          userId: new mongoose.Types.ObjectId(filters.userId),
        },
      });
    }

    // Status filter (optional)
    if (filters.status && Array.isArray(filters.status) && filters.status.length > 0) {
      pipeline.push({
        $match: {
          status: { $in: filters.status },
        },
      });
    }

    return pipeline;
  }

  /**
   * Get collection names and record types
   */
  async getAvailableCollections() {
    try {
      const db = mongoose.connection.db;
      const collections = await db.listCollections().toArray();
      return collections.map(col => col.name);
    } catch (error) {
      console.error('Error fetching collections:', error);
      return [];
    }
  }

  /**
   * Count filtered records across collections
   */
  async countFilteredRecords(collections, filters = {}) {
    const counts = {};

    try {
      for (const collectionName of collections) {
        try {
          const collection = mongoose.connection.collection(collectionName);
          const pipeline = this.buildAggregationPipeline(filters);

          // Add count stage
          pipeline.push({ $count: 'total' });

          const result = await collection.aggregate(pipeline).toArray();
          counts[collectionName] = result.length > 0 ? result[0].total : 0;
        } catch (error) {
          console.warn(`Error counting records in ${collectionName}:`, error.message);
          counts[collectionName] = 0;
        }
      }

      return counts;
    } catch (error) {
      console.error('Error counting filtered records:', error);
      throw error;
    }
  }

  /**
   * Export filtered data as JSON with streaming support
   */
  async exportAsJSON(collections, filters = {}, outputPath) {
    try {
      await this.initializeDirectories();

      // First pass: collect all data
      const data = {};
      let recordCount = 0;

      for (const collectionName of collections) {
        try {
          const collection = mongoose.connection.collection(collectionName);
          const pipeline = this.buildAggregationPipeline(filters);
          pipeline.push({ $batchSize: 1000 });

          const cursor = await collection.aggregate(pipeline);
          const docs = [];

          for await (const doc of cursor) {
            docs.push(this.cleanDocument(doc));
            recordCount++;
          }

          data[collectionName] = docs;
        } catch (error) {
          console.warn(`Error exporting collection ${collectionName}:`, error.message);
          data[collectionName] = [];
        }
      }

      // Second pass: write to file with correct metadata
      const writeStream = createWriteStream(outputPath, { encoding: 'utf8' });

      writeStream.write('{\n  "metadata": {\n');
      writeStream.write(`    "exportDate": "${new Date().toISOString()}",\n`);
      writeStream.write(`    "filters": ${JSON.stringify(filters, null, 2)},\n`);
      writeStream.write(`    "collections": ${JSON.stringify(collections)},\n`);
      writeStream.write(`    "recordCount": ${recordCount}\n`);
      writeStream.write('  },\n  "data": {\n');

      const collectionKeys = Object.keys(data);
      collectionKeys.forEach((collectionName, index) => {
        writeStream.write(`    "${collectionName}": `);
        writeStream.write(JSON.stringify(data[collectionName], null, 2).split('\n').join('\n    '));
        if (index < collectionKeys.length - 1) {
          writeStream.write(',\n');
        } else {
          writeStream.write('\n');
        }
      });

      writeStream.write('  }\n}');
      writeStream.end();

      return new Promise((resolve, reject) => {
        writeStream.on('finish', async () => {
          try {
            const stats = await fs.stat(outputPath);
            resolve({
              path: outputPath,
              recordCount,
              size: stats.size,
            });
          } catch (err) {
            reject(err);
          }
        });
        writeStream.on('error', reject);
      });
    } catch (error) {
      console.error('Error exporting as JSON:', error);
      throw error;
    }
  }

  /**
   * Export filtered data as CSV with streaming support
   */
  async exportAsCSV(collections, filters = {}, outputPath) {
    try {
      await this.initializeDirectories();

      const writeStream = createWriteStream(outputPath, { encoding: 'utf8' });
      let recordCount = 0;
      let isFirstCollection = true;

      for (const collectionName of collections) {
        try {
          const collection = mongoose.connection.collection(collectionName);
          const pipeline = this.buildAggregationPipeline(filters);
          pipeline.push({ $batchSize: 1000 });

          const cursor = await collection.aggregate(pipeline);
          const records = [];

          for await (const doc of cursor) {
            const cleanedDoc = this.cleanDocument(doc);
            records.push(cleanedDoc);
          }

          if (records.length > 0) {
            // Add metadata row for collection name
            if (!isFirstCollection) {
              writeStream.write('\n');
            }

            writeStream.write(`# Collection: ${collectionName}\n`);

            // Get headers from first record
            const headers = Object.keys(records[0]);
            writeStream.write(headers.join(',') + '\n');

            // Write records
            for (const record of records) {
              const values = headers.map(header => {
                const value = record[header];
                // Handle CSV escaping
                if (value === null || value === undefined) {
                  return '';
                }
                const stringValue =
                  typeof value === 'object' ? JSON.stringify(value) : String(value);
                return stringValue.includes(',') ||
                  stringValue.includes('"') ||
                  stringValue.includes('\n')
                  ? `"${stringValue.replace(/"/g, '""')}"`
                  : stringValue;
              });
              writeStream.write(values.join(',') + '\n');
              recordCount++;
            }

            isFirstCollection = false;
          }
        } catch (error) {
          console.warn(`Error exporting collection ${collectionName} as CSV:`, error.message);
        }
      }

      writeStream.end();

      return new Promise((resolve, reject) => {
        writeStream.on('finish', async () => {
          try {
            const stats = await fs.stat(outputPath);
            resolve({
              path: outputPath,
              recordCount,
              size: stats.size,
            });
          } catch (err) {
            reject(err);
          }
        });
        writeStream.on('error', reject);
      });
    } catch (error) {
      console.error('Error exporting as CSV:', error);
      throw error;
    }
  }

  /**
   * Clean MongoDB documents by removing internal fields
   */
  cleanDocument(doc) {
    const cleaned = { ...doc };
    delete cleaned.__v;
    delete cleaned._id;

    // Convert ObjectId to string
    if (cleaned.userId && cleaned.userId instanceof mongoose.Types.ObjectId) {
      cleaned.userId = cleaned.userId.toString();
    }

    return cleaned;
  }

  /**
   * Create backup metadata
   */
  createBackupMetadata(filters, collections, recordCounts, format) {
    return {
      backupId: this.generateBackupId(),
      timestamp: new Date(),
      format, // 'json', 'csv', or 'both'
      filters: {
        startDate: filters.startDate || null,
        endDate: filters.endDate || null,
        recordTypes: filters.recordTypes || [],
        userId: filters.userId || null,
        status: filters.status || [],
      },
      collections,
      recordCounts,
      totalRecords: Object.values(recordCounts).reduce((a, b) => a + b, 0),
      filtersApplied: this.summarizeFilters(filters),
      version: '1.0',
    };
  }

  /**
   * Summarize applied filters for metadata
   */
  summarizeFilters(filters) {
    const summary = [];

    if (filters.startDate && filters.endDate) {
      summary.push(`Date range: ${filters.startDate} to ${filters.endDate}`);
    } else if (filters.startDate) {
      summary.push(`From: ${filters.startDate}`);
    } else if (filters.endDate) {
      summary.push(`Until: ${filters.endDate}`);
    }

    if (filters.recordTypes && filters.recordTypes.length > 0) {
      summary.push(`Record types: ${filters.recordTypes.join(', ')}`);
    }

    if (filters.userId) {
      summary.push(`User: ${filters.userId}`);
    }

    if (filters.status && filters.status.length > 0) {
      summary.push(`Status: ${filters.status.join(', ')}`);
    }

    return summary;
  }

  /**
   * Generate unique backup ID
   */
  generateBackupId() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const random = Math.random().toString(36).substring(2, 8);
    return `filtered-backup-${timestamp}-${random}`;
  }

  /**
   * Create filtered backup with specified format
   */
  async createFilteredBackup(collections, filters = {}, format = 'both') {
    try {
      await this.initializeDirectories();

      // Validate format
      if (!['json', 'csv', 'both'].includes(format)) {
        throw new Error('Invalid format. Must be one of: json, csv, both');
      }

      // Count records across collections
      const recordCounts = await this.countFilteredRecords(collections, filters);
      const totalRecords = Object.values(recordCounts).reduce((a, b) => a + b, 0);

      if (totalRecords === 0) {
        throw new Error('No records match the specified filters');
      }

      const backupId = this.generateBackupId();
      const metadata = this.createBackupMetadata(filters, collections, recordCounts, format);

      const result = {
        backupId,
        metadata,
        files: {},
        startTime: new Date(),
      };

      // Create JSON export if requested
      if (format === 'json' || format === 'both') {
        const jsonPath = path.join(this.exportDir, `${backupId}.json`);
        console.log(`Exporting to JSON: ${jsonPath}`);
        const jsonResult = await this.exportAsJSON(collections, filters, jsonPath);
        const jsonStats = await fs.stat(jsonPath);
        result.files.json = {
          path: jsonPath,
          size: jsonStats.size,
          recordCount: totalRecords,
        };
      }

      // Create CSV export if requested
      if (format === 'csv' || format === 'both') {
        const csvPath = path.join(this.exportDir, `${backupId}.csv`);
        console.log(`Exporting to CSV: ${csvPath}`);
        const csvResult = await this.exportAsCSV(collections, filters, csvPath);
        const csvStats = await fs.stat(csvPath);
        result.files.csv = {
          path: csvPath,
          size: csvStats.size,
          recordCount: totalRecords,
        };
      }

      // Save metadata
      const metadataPath = path.join(this.exportDir, `${backupId}-metadata.json`);
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
      result.metadataPath = metadataPath;

      result.endTime = new Date();
      result.duration = result.endTime - result.startTime;

      return result;
    } catch (error) {
      console.error('Error creating filtered backup:', error);
      throw error;
    }
  }

  /**
   * Get backup file for download
   */
  async getBackupFile(backupId, format = 'json') {
    try {
      const fileName = `${backupId}.${format}`;
      const filePath = path.join(this.exportDir, fileName);

      // Check if file exists
      await fs.access(filePath);

      return {
        path: filePath,
        fileName,
        size: (await fs.stat(filePath)).size,
      };
    } catch (error) {
      console.error(`Error getting backup file ${backupId}:`, error);
      throw new Error(`Backup file not found: ${backupId}`);
    }
  }

  /**
   * Get backup metadata
   */
  async getBackupMetadata(backupId) {
    try {
      const metadataPath = path.join(this.exportDir, `${backupId}-metadata.json`);
      const content = await fs.readFile(metadataPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`Error getting backup metadata ${backupId}:`, error);
      throw new Error(`Backup metadata not found: ${backupId}`);
    }
  }

  /**
   * List all filtered backups
   */
  async listFilteredBackups(limit = 20, offset = 0) {
    try {
      await this.initializeDirectories();

      const files = await fs.readdir(this.exportDir);
      const metadataFiles = files
        .filter(f => f.endsWith('-metadata.json'))
        .sort()
        .reverse()
        .slice(offset, offset + limit);

      const backups = [];
      for (const file of metadataFiles) {
        const filePath = path.join(this.exportDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        const metadata = JSON.parse(content);
        const fileStats = await fs.stat(filePath);

        backups.push({
          ...metadata,
          fileSize: fileStats.size,
          createdAt: fileStats.birthtime,
        });
      }

      return {
        backups,
        total: metadataFiles.length,
        limit,
        offset,
      };
    } catch (error) {
      console.error('Error listing filtered backups:', error);
      throw error;
    }
  }

  /**
   * Delete filtered backup and related files
   */
  async deleteFilteredBackup(backupId) {
    try {
      const files = [
        path.join(this.exportDir, `${backupId}.json`),
        path.join(this.exportDir, `${backupId}.csv`),
        path.join(this.exportDir, `${backupId}-metadata.json`),
      ];

      for (const filePath of files) {
        try {
          await fs.unlink(filePath);
        } catch (error) {
          // File might not exist, that's okay
          if (error.code !== 'ENOENT') {
            throw error;
          }
        }
      }

      return { success: true, backupId };
    } catch (error) {
      console.error(`Error deleting backup ${backupId}:`, error);
      throw error;
    }
  }
}

export default FilteredBackupService;
