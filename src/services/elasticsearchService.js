import esClient from '../config/elasticsearch.js';
import dotenv from 'dotenv';

dotenv.config();

const INDEX_NAME = process.env.ELASTICSEARCH_INDEX || 'medical_records';

/**
 * Index mapping configuration for medical records
 */
const INDEX_MAPPING = {
  properties: {
    diagnosis: {
      type: 'text',
      analyzer: 'standard',
      fields: {
        keyword: {
          type: 'keyword',
          ignore_above: 256,
        },
      },
    },
    treatment: {
      type: 'text',
      analyzer: 'standard',
      fields: {
        keyword: {
          type: 'keyword',
          ignore_above: 256,
        },
      },
    },
    notes: {
      type: 'text',
      analyzer: 'standard',
    },
    patientId: {
      type: 'keyword',
    },
    patientName: {
      type: 'text',
      fields: {
        keyword: {
          type: 'keyword',
          ignore_above: 256,
        },
      },
    },
    patientEmail: {
      type: 'keyword',
    },
    createdAt: {
      type: 'date',
    },
  },
};

// ============================================
// Index Management Functions
// ============================================

/**
 * Check if index exists
 * @returns {Promise<boolean>}
 */
export async function indexExists() {
  try {
    const result = await esClient.indices.exists({ index: INDEX_NAME });
    return result;
  } catch (error) {
    console.error('Error checking index existence:', error.message);
    return false;
  }
}

/**
 * Create index with mappings
 * @returns {Promise<boolean>} True if created successfully
 */
export async function createIndex() {
  try {
    const exists = await indexExists();
    if (exists) {
      console.log(`Index '${INDEX_NAME}' already exists`);
      return true;
    }

    await esClient.indices.create({
      index: INDEX_NAME,
      body: {
        mappings: INDEX_MAPPING,
        settings: {
          number_of_shards: 1,
          number_of_replicas: 1,
          analysis: {
            analyzer: {
              standard: {
                type: 'standard',
              },
            },
          },
        },
      },
    });

    console.log(`✅ Index '${INDEX_NAME}' created successfully`);
    return true;
  } catch (error) {
    console.error('Error creating index:', error.message);
    throw error;
  }
}

/**
 * Delete index (for development/testing)
 * @returns {Promise<boolean>}
 */
export async function deleteIndex() {
  try {
    const exists = await indexExists();
    if (!exists) {
      console.log(`Index '${INDEX_NAME}' does not exist`);
      return true;
    }

    await esClient.indices.delete({ index: INDEX_NAME });
    console.log(`Index '${INDEX_NAME}' deleted successfully`);
    return true;
  } catch (error) {
    console.error('Error deleting index:', error.message);
    throw error;
  }
}

// ============================================
// Document Operations
// ============================================

/**
 * Index a single document
 * @param {string} recordId - MongoDB record ID
 * @param {Object} data - Document data to index
 * @returns {Promise<Object>}
 */
export async function indexDocument(recordId, data) {
  try {
    const response = await esClient.index({
      index: INDEX_NAME,
      id: recordId,
      document: data,
      refresh: false, // Don't force refresh for performance
    });

    return response;
  } catch (error) {
    console.error(`Error indexing document ${recordId}:`, error.message);
    throw error;
  }
}

/**
 * Update an existing document
 * @param {string} recordId - MongoDB record ID
 * @param {Object} data - Updated document data
 * @returns {Promise<Object>}
 */
export async function updateDocument(recordId, data) {
  try {
    const response = await esClient.update({
      index: INDEX_NAME,
      id: recordId,
      doc: data,
      refresh: false,
    });

    return response;
  } catch (error) {
    // If document doesn't exist, index it instead
    if (error.meta?.statusCode === 404) {
      return await indexDocument(recordId, data);
    }
    console.error(`Error updating document ${recordId}:`, error.message);
    throw error;
  }
}

/**
 * Delete a document from index
 * @param {string} recordId - MongoDB record ID
 * @returns {Promise<Object>}
 */
export async function deleteDocument(recordId) {
  try {
    const response = await esClient.delete({
      index: INDEX_NAME,
      id: recordId,
      refresh: false,
    });

    return response;
  } catch (error) {
    // Ignore 404 errors (document already deleted or never indexed)
    if (error.meta?.statusCode === 404) {
      console.log(`Document ${recordId} not found in index (already deleted)`);
      return { result: 'not_found' };
    }
    console.error(`Error deleting document ${recordId}:`, error.message);
    throw error;
  }
}

/**
 * Bulk index multiple documents
 * @param {Array<Object>} records - Array of records with _id and data
 * @returns {Promise<Object>} Bulk operation result
 */
export async function bulkIndex(records) {
  try {
    if (!records || records.length === 0) {
      return { indexed: 0, errors: [] };
    }

    const operations = records.flatMap(record => [
      { index: { _index: INDEX_NAME, _id: record._id.toString() } },
      record.data,
    ]);

    const response = await esClient.bulk({
      operations,
      refresh: true,
    });

    const errors = response.items
      .filter(item => item.index?.error)
      .map(item => ({
        id: item.index._id,
        error: item.index.error,
      }));

    return {
      indexed: records.length - errors.length,
      errors,
      took: response.took,
    };
  } catch (error) {
    console.error('Error bulk indexing documents:', error.message);
    throw error;
  }
}

// ============================================
// Search Operations
// ============================================

/**
 * Search medical records with advanced features
 * @param {string} query - Search query string
 * @param {Object} options - Search options
 * @param {number} options.page - Page number (default: 1)
 * @param {number} options.limit - Results per page (default: 10, max: 100)
 * @param {string} options.sortBy - Sort field (default: '_score')
 * @param {string} options.sortOrder - Sort order (default: 'desc')
 * @param {Object} options.filters - Facet filters
 * @returns {Promise<Object>} Search results
 */
export async function searchRecords(query, options = {}) {
  try {
    const { page = 1, limit = 10, sortBy = '_score', sortOrder = 'desc', filters = {} } = options;

    const from = (page - 1) * limit;
    const size = Math.min(limit, 100); // Cap at 100

    // Build filter clauses from facet filters
    const filterClauses = [];

    if (filters.diagnosis) {
      filterClauses.push({
        term: { 'diagnosis.keyword': filters.diagnosis },
      });
    }

    if (filters.patientId) {
      filterClauses.push({
        term: { patientId: filters.patientId },
      });
    }

    if (filters.dateFrom || filters.dateTo) {
      const rangeFilter = { range: { createdAt: {} } };
      if (filters.dateFrom) rangeFilter.range.createdAt.gte = filters.dateFrom;
      if (filters.dateTo) rangeFilter.range.createdAt.lte = filters.dateTo;
      filterClauses.push(rangeFilter);
    }

    // Build sort configuration
    const sort = [];
    if (sortBy === '_score') {
      sort.push('_score');
    } else if (sortBy === 'createdAt') {
      sort.push({ createdAt: { order: sortOrder } });
    }

    // Construct search query
    const searchBody = {
      query: {
        bool: {
          must: [
            {
              multi_match: {
                query,
                fields: ['diagnosis^2', 'treatment^2', 'notes', 'patientName'],
                fuzziness: 'AUTO',
                operator: 'or',
                type: 'best_fields',
              },
            },
          ],
          filter: filterClauses,
        },
      },
      highlight: {
        pre_tags: ['<em>'],
        post_tags: ['</em>'],
        fields: {
          diagnosis: {
            number_of_fragments: 0, // Return entire field
          },
          treatment: {
            number_of_fragments: 0,
          },
          notes: {
            fragment_size: 150,
            number_of_fragments: 3,
          },
          patientName: {
            number_of_fragments: 0,
          },
        },
      },
      aggs: {
        diagnoses: {
          terms: {
            field: 'diagnosis.keyword',
            size: 10,
          },
        },
        dates: {
          date_histogram: {
            field: 'createdAt',
            calendar_interval: 'month',
          },
        },
      },
      from,
      size,
      sort,
    };

    const response = await esClient.search({
      index: INDEX_NAME,
      body: searchBody,
    });

    // Transform results
    const results = response.hits.hits.map(hit => ({
      _id: hit._id,
      _score: hit._score,
      ...hit._source,
      highlight: hit.highlight || {},
    }));

    // Transform aggregations into facets
    const facets = {
      diagnoses:
        response.aggregations?.diagnoses?.buckets.map(bucket => ({
          key: bucket.key,
          count: bucket.doc_count,
        })) || [],
      dates:
        response.aggregations?.dates?.buckets.map(bucket => ({
          key: bucket.key_as_string,
          count: bucket.doc_count,
        })) || [],
    };

    return {
      query,
      took: response.took,
      total: response.hits.total.value,
      page,
      limit: size,
      pages: Math.ceil(response.hits.total.value / size),
      results,
      facets,
    };
  } catch (error) {
    console.error('Error searching records:', error.message);
    throw error;
  }
}

/**
 * Get index statistics
 * @returns {Promise<Object>} Index stats
 */
export async function getIndexStats() {
  try {
    const stats = await esClient.indices.stats({ index: INDEX_NAME });
    const health = await esClient.cluster.health({ index: INDEX_NAME });

    return {
      indexName: INDEX_NAME,
      health: health.status,
      documentCount: stats.indices[INDEX_NAME]?.total?.docs?.count || 0,
      indexSize: stats.indices[INDEX_NAME]?.total?.store?.size_in_bytes || 0,
      indexSizeHuman: formatBytes(stats.indices[INDEX_NAME]?.total?.store?.size_in_bytes || 0),
    };
  } catch (error) {
    console.error('Error getting index stats:', error.message);
    throw error;
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Format bytes to human-readable string
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

export default {
  createIndex,
  deleteIndex,
  indexExists,
  indexDocument,
  updateDocument,
  deleteDocument,
  bulkIndex,
  searchRecords,
  getIndexStats,
};
