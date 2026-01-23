import { Client } from '@elastic/elasticsearch';
import dotenv from 'dotenv';

dotenv.config();

const ELASTICSEARCH_NODE = process.env.ELASTICSEARCH_NODE || 'http://localhost:9200';
const ELASTICSEARCH_REQUEST_TIMEOUT = parseInt(process.env.ELASTICSEARCH_REQUEST_TIMEOUT || '5000', 10);
const ELASTICSEARCH_MAX_RETRIES = parseInt(process.env.ELASTICSEARCH_MAX_RETRIES || '3', 10);

// Create Elasticsearch client singleton
const esClient = new Client({
  node: ELASTICSEARCH_NODE,
  maxRetries: ELASTICSEARCH_MAX_RETRIES,
  requestTimeout: ELASTICSEARCH_REQUEST_TIMEOUT,
  sniffOnStart: true,
});

/**
 * Health check for Elasticsearch connection
 * @returns {Promise<boolean>} True if connection is healthy
 */
export async function checkESHealth() {
  try {
    const health = await esClient.ping();
    console.log('✅ Elasticsearch connection established');
    return health;
  } catch (error) {
    console.error('❌ Elasticsearch connection failed:', error.message);
    return false;
  }
}

/**
 * Initialize Elasticsearch connection and verify health
 * @returns {Promise<void>}
 */
export async function initializeElasticsearch() {
  try {
    const isHealthy = await checkESHealth();
    if (!isHealthy) {
      console.warn('⚠️  Elasticsearch is not available. Search features will be limited.');
    }
  } catch (error) {
    console.error('Failed to initialize Elasticsearch:', error.message);
    throw error;
  }
}

export default esClient;
