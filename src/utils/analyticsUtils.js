/**
 * Analytics Utilities
 * Helper functions for analytics calculations
 */

/**
 * Calculate percentile value from an array of numbers
 * @param {number[]} arr - Array of numbers
 * @param {number} p - Percentile (0-100)
 * @returns {number} The percentile value
 */
export function calculatePercentile(arr, p) {
  if (!arr || arr.length === 0) return 0;

  const sorted = arr.slice().sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;

  return sorted[Math.max(0, index)];
}

/**
 * Calculate multiple percentiles
 * @param {number[]} arr - Array of numbers
 * @param {number[]} percentiles - Array of percentiles to calculate
 * @returns {object} Object with percentile keys
 */
export function calculatePercentiles(arr, percentiles = [50, 95, 99]) {
  const result = {};
  percentiles.forEach((p) => {
    result[`p${p}`] = calculatePercentile(arr, p);
  });
  return result;
}

/**
 * Calculate standard deviation
 * @param {number[]} arr - Array of numbers
 * @returns {number} Standard deviation
 */
export function calculateStdDeviation(arr) {
  if (arr.length < 2) return 0;

  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const squareDiffs = arr.map((value) => Math.pow(value - mean, 2));
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / arr.length;

  return Math.sqrt(avgSquareDiff);
}

/**
 * Format bytes to human readable format
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted string
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Format duration in milliseconds to human readable format
 * @param {number} ms - Milliseconds
 * @returns {string} Formatted string
 */
export function formatDuration(ms) {
  if (ms < 1000) return ms + ' ms';
  if (ms < 60000) return (ms / 1000).toFixed(2) + ' s';
  return (ms / 60000).toFixed(2) + ' m';
}

/**
 * Get percentile bucket (e.g., 'p50', 'p95', 'p99')
 * @param {number} value - Value to check
 * @param {number} p50 - P50 value
 * @param {number} p95 - P95 value
 * @param {number} p99 - P99 value
 * @returns {string} Percentile bucket
 */
export function getPercentileBucket(value, p50, p95, p99) {
  if (value >= p99) return 'p99+';
  if (value >= p95) return 'p95-p99';
  if (value >= p50) return 'p50-p95';
  return 'p50-';
}

/**
 * Get health status based on error rate
 * @param {number} errorRate - Error rate as percentage
 * @returns {string} Health status
 */
export function getHealthStatus(errorRate) {
  if (errorRate < 1) return 'healthy';
  if (errorRate < 5) return 'warning';
  return 'critical';
}

/**
 * Get performance grade based on response time
 * @param {number} avgDuration - Average response time in milliseconds
 * @returns {string} Performance grade
 */
export function getPerformanceGrade(avgDuration) {
  if (avgDuration < 100) return 'A';
  if (avgDuration < 300) return 'B';
  if (avgDuration < 1000) return 'C';
  if (avgDuration < 3000) return 'D';
  return 'F';
}
