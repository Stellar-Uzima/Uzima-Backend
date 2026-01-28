/**
 * API Metrics Database Setup
 * This file contains utilities for ensuring the APIMetric collection
 * and indexes are properly initialized
 */

import mongoose from 'mongoose';
import APIMetric from '../models/APIMetric.js';

/**
 * Initialize API Metrics collection and indexes
 * Call this during application startup
 */
export async function initializeAPIMetrics() {
  try {
    // Ensure model is registered
    const model = mongoose.model('APIMetric', APIMetric.schema);

    // Create indexes
    await model.syncIndexes();

    console.log('[APIMetrics] Collection and indexes initialized successfully');

    // Log index information
    const indexes = await model.collection.getIndexes();
    console.log(`[APIMetrics] Created ${Object.keys(indexes).length} indexes`);

    // Verify TTL index
    const ttlIndex = await model.collection.indexInformation();
    const hasTTL = Object.values(ttlIndex).some(
      (idx) => idx.expireAfterSeconds !== undefined
    );

    if (hasTTL) {
      console.log('[APIMetrics] TTL index verified (90-day auto-cleanup enabled)');
    } else {
      console.warn('[APIMetrics] Warning: TTL index not found');
    }

    return true;
  } catch (error) {
    console.error('[APIMetrics] Initialization error:', error);
    throw error;
  }
}

/**
 * Verify API Metrics collection exists and is healthy
 */
export async function verifyAPIMetrics() {
  try {
    const model = mongoose.model('APIMetric');

    // Check if collection exists
    const collections = await mongoose.connection.db.listCollections().toArray();
    const hasCollection = collections.some((c) => c.name === 'apiMetrics');

    if (!hasCollection) {
      console.warn('[APIMetrics] Collection does not exist yet (will be created on first metric)');
      return false;
    }

    // Count documents
    const count = await model.countDocuments();
    console.log(`[APIMetrics] Collection exists with ${count} documents`);

    // Check indexes
    const indexes = await model.collection.getIndexes();
    console.log(`[APIMetrics] ${Object.keys(indexes).length} indexes found`);

    return true;
  } catch (error) {
    console.error('[APIMetrics] Verification error:', error);
    return false;
  }
}

/**
 * Get API Metrics collection statistics
 */
export async function getAPIMetricsStats() {
  try {
    const model = mongoose.model('APIMetric');

    const stats = await model.collection.stats();
    return {
      documentCount: stats.count,
      collectionSize: stats.size,
      averageDocumentSize: stats.avgObjSize,
      indexSize: stats.totalIndexSize,
      storageSize: stats.storageSize,
    };
  } catch (error) {
    console.error('[APIMetrics] Stats error:', error);
    return null;
  }
}

/**
 * Clean up old metrics (older than specified days)
 * @param {number} daysOld - Delete metrics older than this many days
 * @returns {Promise<object>} Result with deletedCount
 */
export async function cleanupOldMetrics(daysOld = 90) {
  try {
    const model = mongoose.model('APIMetric');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await model.deleteMany({
      createdAt: { $lt: cutoffDate },
    });

    console.log(
      `[APIMetrics] Deleted ${result.deletedCount} metrics older than ${daysOld} days`
    );

    return result;
  } catch (error) {
    console.error('[APIMetrics] Cleanup error:', error);
    throw error;
  }
}

/**
 * Rebuild all indexes (useful for maintenance)
 */
export async function rebuildIndexes() {
  try {
    const model = mongoose.model('APIMetric');

    // Drop existing indexes (except _id)
    await model.collection.dropIndexes();

    // Recreate indexes
    await model.syncIndexes();

    console.log('[APIMetrics] Indexes rebuilt successfully');

    return true;
  } catch (error) {
    console.error('[APIMetrics] Rebuild error:', error);
    throw error;
  }
}

/**
 * Export metrics to JSON for backup
 * @param {object} query - MongoDB query filter
 * @param {number} limit - Max documents to export
 * @returns {Promise<array>} Array of metric documents
 */
export async function exportMetrics(query = {}, limit = 10000) {
  try {
    const model = mongoose.model('APIMetric');

    const metrics = await model.find(query).limit(limit).lean();

    console.log(`[APIMetrics] Exported ${metrics.length} metrics`);

    return metrics;
  } catch (error) {
    console.error('[APIMetrics] Export error:', error);
    throw error;
  }
}

/**
 * Archive metrics to a separate collection
 * @param {Date} beforeDate - Archive metrics created before this date
 * @returns {Promise<object>} Result with movedCount
 */
export async function archiveMetrics(beforeDate) {
  try {
    const model = mongoose.model('APIMetric');

    // Create archive collection name
    const archiveCollectionName = `apiMetrics_archive_${beforeDate.getFullYear()}_${String(
      beforeDate.getMonth() + 1
    ).padStart(2, '0')}`;

    // Move documents to archive
    const toArchive = await model.find({
      createdAt: { $lt: beforeDate },
    });

    if (toArchive.length === 0) {
      console.log('[APIMetrics] No metrics to archive');
      return { movedCount: 0 };
    }

    // Insert into archive collection
    await mongoose.connection.collection(archiveCollectionName).insertMany(
      toArchive.map((doc) => doc.toObject())
    );

    // Delete from main collection
    await model.deleteMany({
      createdAt: { $lt: beforeDate },
    });

    console.log(
      `[APIMetrics] Archived ${toArchive.length} metrics to ${archiveCollectionName}`
    );

    return {
      movedCount: toArchive.length,
      archiveCollection: archiveCollectionName,
    };
  } catch (error) {
    console.error('[APIMetrics] Archive error:', error);
    throw error;
  }
}

/**
 * Generate health report of API Metrics
 */
export async function generateHealthReport() {
  try {
    const model = mongoose.model('APIMetric');

    const stats = await getAPIMetricsStats();
    const indexInfo = await model.collection.getIndexes();

    const pipeline = [
      {
        $group: {
          _id: null,
          totalMetrics: { $sum: 1 },
          avgDuration: { $avg: '$duration' },
          minDuration: { $min: '$duration' },
          maxDuration: { $max: '$duration' },
          errorCount: { $sum: { $cond: ['$isError', 1, 0] } },
          errorRate: {
            $multiply: [
              {
                $divide: [
                  { $sum: { $cond: ['$isError', 1, 0] } },
                  { $sum: 1 },
                ],
              },
              100,
            ],
          },
          slowQueryCount: { $sum: { $cond: ['$isSlowQuery', 1, 0] } },
        },
      },
    ];

    const [analyticsData] = await model.aggregate(pipeline);

    const oldestMetric = await model
      .findOne()
      .sort({ createdAt: 1 })
      .select('createdAt');
    const newestMetric = await model
      .findOne()
      .sort({ createdAt: -1 })
      .select('createdAt');

    return {
      status: 'healthy',
      timestamp: new Date(),
      collection: {
        documentCount: stats?.documentCount || 0,
        collectionSizeBytes: stats?.collectionSize || 0,
        indexSizeBytes: stats?.indexSize || 0,
        averageDocumentSize: stats?.averageDocumentSize || 0,
      },
      indexes: {
        total: Object.keys(indexInfo).length,
        list: Object.keys(indexInfo),
      },
      analytics: {
        totalMetrics: analyticsData?.totalMetrics || 0,
        avgDuration: Math.round(analyticsData?.avgDuration || 0),
        minDuration: analyticsData?.minDuration || 0,
        maxDuration: analyticsData?.maxDuration || 0,
        errorCount: analyticsData?.errorCount || 0,
        errorRate: Math.round((analyticsData?.errorRate || 0) * 100) / 100,
        slowQueryCount: analyticsData?.slowQueryCount || 0,
      },
      dateRange: {
        oldest: oldestMetric?.createdAt,
        newest: newestMetric?.createdAt,
      },
    };
  } catch (error) {
    console.error('[APIMetrics] Health report error:', error);
    return {
      status: 'error',
      error: error.message,
    };
  }
}

export default {
  initializeAPIMetrics,
  verifyAPIMetrics,
  getAPIMetricsStats,
  cleanupOldMetrics,
  rebuildIndexes,
  exportMetrics,
  archiveMetrics,
  generateHealthReport,
};
