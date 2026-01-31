import * as elasticsearchService from '../services/elasticsearchService.js';
import MedicalRecord from '../models/medicalRecord.m.model.js';

/**
 * Search medical records using Elasticsearch
 * GET /api/search?q=query&page=1&limit=10&sortBy=_score&sortOrder=desc
 */
export async function searchMedicalRecords(req, res) {
  try {
    const { q, page = 1, limit = 10, sortBy = '_score', sortOrder = 'desc', filters } = req.query;

    // Validate query parameter
    if (!q || q.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Search query parameter "q" is required',
      });
    }

    // Validate query length
    if (q.length > 200) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be 200 characters or less',
      });
    }

    // Parse page and limit
    const pageNum = parseInt(page, 10);
    const limitNum = Math.min(parseInt(limit, 10), 100);

    if (pageNum < 1) {
      return res.status(400).json({
        success: false,
        message: 'Page must be 1 or greater',
      });
    }

    if (limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        message: 'Limit must be between 1 and 100',
      });
    }

    // Parse filters if provided
    let parsedFilters = {};
    if (filters) {
      try {
        parsedFilters = typeof filters === 'string' ? JSON.parse(filters) : filters;
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid filters format. Must be valid JSON.',
        });
      }
    }

    // Perform search
    const results = await elasticsearchService.searchRecords(q.trim(), {
      page: pageNum,
      limit: limitNum,
      sortBy,
      sortOrder,
      filters: parsedFilters,
    });

    // Check if search took longer than 200ms
    if (results.took > 200) {
      console.warn(`⚠️  Search took ${results.took}ms (target: <200ms). Query: "${q}"`);
    }

    return res.status(200).json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error('Error in searchMedicalRecords:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while searching records',
      error: error.message,
    });
  }
}

/**
 * Reindex all medical records from MongoDB to Elasticsearch
 * POST /api/search/reindex
 * Admin only
 */
export async function reindexAllRecords(req, res) {
  try {
    console.log('Starting reindex of all medical records...');
    const startTime = Date.now();

    // Check if index exists, create if not
    const exists = await elasticsearchService.indexExists();
    if (!exists) {
      await elasticsearchService.createIndex();
    }

    // Fetch all medical records from MongoDB
    const records = await MedicalRecord.find({})
      .populate('patientId', 'firstName lastName email')
      .lean();

    console.log(`Found ${records.length} medical records to index`);

    if (records.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No records to index',
        stats: {
          total: 0,
          indexed: 0,
          errors: 0,
          duration: Date.now() - startTime,
        },
      });
    }

    // Prepare bulk index data
    const bulkData = records.map(record => ({
      _id: record._id,
      data: {
        diagnosis: record.diagnosis || '',
        treatment: record.treatment || '',
        notes: record.notes || '',
        patientId: record.patientId?._id?.toString() || '',
        patientName: record.patientId
          ? `${record.patientId.firstName || ''} ${record.patientId.lastName || ''}`.trim()
          : '',
        patientEmail: record.patientId?.email || '',
        createdAt: record.createdAt,
      },
    }));

    // Bulk index to Elasticsearch
    const result = await elasticsearchService.bulkIndex(bulkData);

    const duration = Date.now() - startTime;

    console.log(`✅ Reindex completed in ${duration}ms`);
    console.log(`   Indexed: ${result.indexed} records`);
    console.log(`   Errors: ${result.errors.length}`);

    return res.status(200).json({
      success: true,
      message: 'Reindexing completed',
      stats: {
        total: records.length,
        indexed: result.indexed,
        errors: result.errors.length,
        duration,
        errorDetails: result.errors.slice(0, 10), // Return first 10 errors only
      },
    });
  } catch (error) {
    console.error('Error in reindexAllRecords:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred during reindexing',
      error: error.message,
    });
  }
}

/**
 * Get Elasticsearch index statistics
 * GET /api/search/stats
 * Admin only
 */
export async function getIndexStats(req, res) {
  try {
    const stats = await elasticsearchService.getIndexStats();

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error in getIndexStats:', error);

    // Check if error is due to index not existing
    if (error.meta?.statusCode === 404) {
      return res.status(404).json({
        success: false,
        message: 'Index does not exist. Run reindex to create it.',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching index statistics',
      error: error.message,
    });
  }
}

export default {
  searchMedicalRecords,
  reindexAllRecords,
  getIndexStats,
};
