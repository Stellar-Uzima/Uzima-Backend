#!/usr/bin/env node

/**
 * Simple script to test rate limiting functionality
 * Run with: node test-rate-limit.js
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

async function makeRequest(endpoint, options = {}) {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });

    const data = await response.text();
    let jsonData;
    try {
      jsonData = JSON.parse(data);
    } catch {
      jsonData = data;
    }

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      data: jsonData
    };
  } catch (error) {
    return {
      status: 'ERROR',
      error: error.message
    };
  }
}

async function testGeneralRateLimit() {
  console.log('\n🧪 Testing General Rate Limiting (100 requests / 15 minutes)');
  console.log('=' .repeat(60));

  for (let i = 1; i <= 10; i++) {
    const result = await makeRequest('/api');
    
    console.log(`Request ${i}:`);
    console.log(`  Status: ${result.status}`);
    console.log(`  Rate Limit: ${result.headers['ratelimit-limit'] || 'N/A'}`);
    console.log(`  Remaining: ${result.headers['ratelimit-remaining'] || 'N/A'}`);
    console.log(`  Reset: ${result.headers['ratelimit-reset'] || 'N/A'}`);
    
    if (result.status === 429) {
      console.log(`  ❌ Rate limited: ${result.data.error || 'Unknown error'}`);
      console.log(`  Retry after: ${result.data.retryAfter || 'N/A'} seconds`);
      break;
    } else {
      console.log(`  ✅ Success`);
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

async function testAuthRateLimit() {
  console.log('\n🔐 Testing Authentication Rate Limiting (5 requests / 15 minutes)');
  console.log('=' .repeat(60));

  for (let i = 1; i <= 8; i++) {
    const result = await makeRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'wrongpassword'
      })
    });
    
    console.log(`Login attempt ${i}:`);
    console.log(`  Status: ${result.status}`);
    console.log(`  Rate Limit: ${result.headers['ratelimit-limit'] || 'N/A'}`);
    console.log(`  Remaining: ${result.headers['ratelimit-remaining'] || 'N/A'}`);
    
    if (result.status === 429) {
      console.log(`  ❌ Rate limited: ${result.data.error || 'Unknown error'}`);
      console.log(`  Retry after: ${result.data.retryAfter || 'N/A'} seconds`);
      break;
    } else {
      console.log(`  ✅ Request processed (likely 401/400)`);
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

async function testRateLimitHeaders() {
  console.log('\n📊 Testing Rate Limit Headers');
  console.log('=' .repeat(60));

  const result = await makeRequest('/api');
  
  console.log('Response Headers:');
  Object.entries(result.headers).forEach(([key, value]) => {
    if (key.toLowerCase().includes('rate') || key.toLowerCase().includes('limit')) {
      console.log(`  ${key}: ${value}`);
    }
  });
}

async function main() {
  console.log('🚀 Starting Rate Limiting Tests');
  console.log('Make sure the server is running on http://localhost:5000');
  console.log('Press Ctrl+C to stop\n');

  try {
    // Test if server is running
    const healthCheck = await makeRequest('/api');
    if (healthCheck.status === 'ERROR') {
      console.log('❌ Server is not running. Please start the server first.');
      console.log('Run: npm run dev');
      process.exit(1);
    }

    await testRateLimitHeaders();
    await testGeneralRateLimit();
    await testAuthRateLimit();

    // Basic cached endpoint load check (requires auth in real app)
    try {
      const start = Date.now();
      for (let i = 0; i < 5; i++) {
        await makeRequest('/api');
      }
      const elapsed = Date.now() - start;
      console.log('\n⚡ Basic cached fetch loop elapsed ms:', elapsed);
    } catch (e) {
      console.log('Cache loop skipped:', e.message);
    }

    console.log('\n✅ Rate limiting tests completed!');
    console.log('\nNote: If you see rate limiting in action, the implementation is working correctly.');
    console.log('Rate limits will reset after the specified time window.');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Tests interrupted by user');
  process.exit(0);
});

main();
