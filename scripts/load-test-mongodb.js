/**
 * MongoDB Connection Pool Load Test Script
 * 
 * Runs load testing scenarios to validate MongoDB connection pool configuration.
 * Tests steady state, spike load, recovery, and sustained load conditions.
 * Collects pool metrics and generates performance report.
 * 
 * Usage: npm run load-test
 * Or with environment: NODE_ENV=test node scripts/load-test-mongodb.js
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000';
const TEST_DURATION_MS = {
  warmup: 10000,
  steadyState: 60000,
  spike: 30000,
  cooldown: 30000,
};

const ARRIVAL_RATES = {
  warmup: 5,      // 5 req/sec
  steadyState: 10, // 10 req/sec
  spike: 50,      // 50 req/sec
  cooldown: 10,   // 10 req/sec
};

// Metrics collection
const metricsLog = [];
const testResults = {
  startTime: new Date().toISOString(),
  endTime: null,
  scenarios: {},
};

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate request timing from arrival rate
 */
function getIntervalMs(requestsPerSecond) {
  return 1000 / requestsPerSecond;
}

/**
 * Make test request to API
 */
async function makeRequest(url) {
  const startTime = Date.now();
  try {
    const response = await axios.get(url, { timeout: 10000 });
    const duration = Date.now() - startTime;
    return {
      success: true,
      status: response.status,
      duration,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      success: false,
      status: error.response?.status || 0,
      duration,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Collect pool metrics
 */
async function collectPoolMetrics() {
  try {
    const response = await axios.get(`${BASE_URL}/api/health/db`, { timeout: 5000 });
    return response.data.pool;
  } catch (error) {
    console.warn('Could not collect pool metrics:', error.message);
    return null;
  }
}

/**
 * Run load test scenario
 */
async function runScenario(name, durationMs, requestsPerSecond, endpoint) {
  console.log(`\n📊 Running scenario: ${name}`);
  console.log(`   Duration: ${durationMs}ms, Rate: ${requestsPerSecond} req/sec`);

  const intervalMs = getIntervalMs(requestsPerSecond);
  const startTime = Date.now();
  const results = {
    name,
    requests: 0,
    successful: 0,
    failed: 0,
    timeouts: 0,
    errors: [],
    responseTimes: [],
    poolMetricsSnapshots: [],
  };

  // Collect initial pool metrics
  const initialPool = await collectPoolMetrics();
  if (initialPool) {
    results.poolMetricsSnapshots.push({
      time: 0,
      ...initialPool,
    });
  }

  let lastMetricsTime = startTime;
  let nextRequestTime = startTime;

  // Main load test loop
  while (Date.now() - startTime < durationMs) {
    const now = Date.now();

    // Collect pool metrics every 5 seconds
    if (now - lastMetricsTime > 5000) {
      const poolMetrics = await collectPoolMetrics();
      if (poolMetrics) {
        results.poolMetricsSnapshots.push({
          time: now - startTime,
          ...poolMetrics,
        });
      }
      lastMetricsTime = now;
    }

    // Make request if it's time
    if (now >= nextRequestTime) {
      const result = await makeRequest(`${BASE_URL}${endpoint}`);
      results.requests++;

      if (result.success) {
        results.successful++;
      } else {
        results.failed++;
        if (result.error?.includes('timeout')) {
          results.timeouts++;
        }
        results.errors.push(result.error);
      }

      results.responseTimes.push(result.duration);
      nextRequestTime = now + intervalMs;
    }

    // Small sleep to prevent busy-waiting
    await sleep(Math.min(10, intervalMs));
  }

  // Collect final pool metrics
  const finalPool = await collectPoolMetrics();
  if (finalPool) {
    results.poolMetricsSnapshots.push({
      time: Date.now() - startTime,
      ...finalPool,
    });
  }

  // Calculate statistics
  results.stats = {
    totalDuration: Date.now() - startTime,
    requestsPerSecond: (results.requests / ((Date.now() - startTime) / 1000)).toFixed(2),
    successRate: ((results.successful / results.requests) * 100).toFixed(2),
    errorRate: ((results.failed / results.requests) * 100).toFixed(2),
    timeoutRate: ((results.timeouts / results.requests) * 100).toFixed(2),
    avgResponseTime: (results.responseTimes.reduce((a, b) => a + b, 0) / results.responseTimes.length).toFixed(2),
    p50ResponseTime: getPercentile(results.responseTimes, 0.5).toFixed(2),
    p95ResponseTime: getPercentile(results.responseTimes, 0.95).toFixed(2),
    p99ResponseTime: getPercentile(results.responseTimes, 0.99).toFixed(2),
    minResponseTime: Math.min(...results.responseTimes),
    maxResponseTime: Math.max(...results.responseTimes),
  };

  // Pool stats
  if (results.poolMetricsSnapshots.length > 0) {
    const pools = results.poolMetricsSnapshots.map(s => s.size);
    results.poolStats = {
      peakSize: Math.max(...pools.map(p => p.current || 0)),
      minAvailable: Math.min(...pools.map(p => p.available || 0)),
      maxQueueWaiting: Math.max(...results.poolMetricsSnapshots.map(s => s.queue?.waiting || 0)),
    };
  }

  console.log(`   ✅ Completed: ${results.requests} requests`);
  console.log(`   Success: ${results.stats.successRate}%, Errors: ${results.stats.errorRate}%`);
  console.log(`   Avg Response: ${results.stats.avgResponseTime}ms, P99: ${results.stats.p99ResponseTime}ms`);
  if (results.poolStats) {
    console.log(`   Pool: Peak=${results.poolStats.peakSize}, Min Available=${results.poolStats.minAvailable}`);
  }

  testResults.scenarios[name] = results;
  return results;
}

/**
 * Calculate percentile from array of values
 */
function getPercentile(values, percentile) {
  const sorted = values.sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * percentile) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Generate test report
 */
function generateReport() {
  const report = {
    testDate: new Date().toISOString(),
    baseUrl: BASE_URL,
    duration: new Date(testResults.endTime) - new Date(testResults.startTime),
    summary: {
      totalRequests: Object.values(testResults.scenarios).reduce((sum, s) => sum + s.requests, 0),
      totalErrors: Object.values(testResults.scenarios).reduce((sum, s) => sum + s.failed, 0),
      totalTimeouts: Object.values(testResults.scenarios).reduce((sum, s) => sum + s.timeouts, 0),
    },
    scenarios: testResults.scenarios,
    recommendations: generateRecommendations(),
  };

  return report;
}

/**
 * Generate recommendations based on test results
 */
function generateRecommendations() {
  const recommendations = [];
  let hasIssues = false;

  Object.entries(testResults.scenarios).forEach(([name, results]) => {
    // Check error rate
    if (parseFloat(results.stats.errorRate) > 1) {
      recommendations.push({
        severity: 'warning',
        scenario: name,
        message: `High error rate: ${results.stats.errorRate}%`,
        action: 'Check MongoDB and network connectivity',
      });
      hasIssues = true;
    }

    // Check timeout rate
    if (parseFloat(results.stats.timeoutRate) > 0.5) {
      recommendations.push({
        severity: 'critical',
        scenario: name,
        message: `High timeout rate: ${results.stats.timeoutRate}%`,
        action: 'Increase MONGO_SOCKET_TIMEOUT_MS and MONGO_MAX_POOL_SIZE',
      });
      hasIssues = true;
    }

    // Check response time
    if (parseFloat(results.stats.p99ResponseTime) > 1000) {
      recommendations.push({
        severity: 'warning',
        scenario: name,
        message: `High P99 response time: ${results.stats.p99ResponseTime}ms`,
        action: 'Consider increasing pool size or optimizing queries',
      });
      hasIssues = true;
    }

    // Check pool exhaustion
    if (results.poolStats && results.poolStats.minAvailable === 0) {
      recommendations.push({
        severity: 'critical',
        scenario: name,
        message: 'Pool was exhausted during test',
        action: 'Increase MONGO_MAX_POOL_SIZE',
      });
      hasIssues = true;
    }
  });

  if (!hasIssues) {
    recommendations.push({
      severity: 'success',
      message: 'All tests passed! Pool configuration is optimal.',
      action: 'No changes needed',
    });
  }

  return recommendations;
}

/**
 * Main test execution
 */
async function runAllTests() {
  console.log(`
╔════════════════════════════════════════════════╗
║   MongoDB Connection Pool Load Test             ║
║   API: ${BASE_URL.padEnd(36)}║
╚════════════════════════════════════════════════╝
  `);

  try {
    // Verify API is running
    console.log('🔍 Verifying API is running...');
    await axios.get(`${BASE_URL}/api/health`, { timeout: 5000 });
    console.log('✅ API is running\n');

    // Run test scenarios
    await runScenario(
      'Warmup',
      TEST_DURATION_MS.warmup,
      ARRIVAL_RATES.warmup,
      '/api/health/db'
    );

    await runScenario(
      'Steady State (10 req/sec)',
      TEST_DURATION_MS.steadyState,
      ARRIVAL_RATES.steadyState,
      '/api/health/db'
    );

    await runScenario(
      'Peak Load Spike (50 req/sec)',
      TEST_DURATION_MS.spike,
      ARRIVAL_RATES.spike,
      '/api/health/db'
    );

    await runScenario(
      'Recovery/Cooldown',
      TEST_DURATION_MS.cooldown,
      ARRIVAL_RATES.cooldown,
      '/api/health/db'
    );

    testResults.endTime = new Date().toISOString();

    // Generate and display report
    const report = generateReport();

    console.log(`
╔════════════════════════════════════════════════╗
║   TEST REPORT                                   ║
╚════════════════════════════════════════════════╝
    `);

    console.log(`Total Requests: ${report.summary.totalRequests}`);
    console.log(`Total Errors: ${report.summary.totalErrors}`);
    console.log(`Total Timeouts: ${report.summary.totalTimeouts}`);

    console.log('\n📋 Recommendations:');
    report.recommendations.forEach(rec => {
      const icon = rec.severity === 'critical' ? '❌' : rec.severity === 'warning' ? '⚠️ ' : '✅';
      console.log(`\n${icon} ${rec.message}`);
      console.log(`   → ${rec.action}`);
    });

    // Save report to file
    const reportPath = path.join(__dirname, '../test-results/mongodb-load-test-report.json');
    const dir = path.dirname(reportPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📁 Full report saved to: ${reportPath}`);

    // Return exit code based on critical issues
    const hasCritical = report.recommendations.some(r => r.severity === 'critical');
    process.exit(hasCritical ? 1 : 0);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
