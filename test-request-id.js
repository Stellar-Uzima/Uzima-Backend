#!/usr/bin/env node

/**
 * Request ID Testing Script
 * Run this to verify all request ID functionality
 */

import { v4 as uuidv4 } from 'uuid';
import correlationIdMiddleware from './src/middleware/correlationId.js';
import requestLogger from './src/middleware/requestLogger.js';
import { addRequestIdToHeaders, getRequestIdFromRequest, fetchWithRequestId } from './src/utils/requestId.js';

console.log('🧪 Testing Request ID Implementation\n');

// Test 1: UUID Generation
console.log('1️⃣ UUID Generation Test:');
const id1 = uuidv4();
const id2 = uuidv4();
console.log(`   ✅ Generated unique IDs: ${id1 !== id2 ? 'PASS' : 'FAIL'}`);
console.log(`   ✅ Valid UUID format: ${/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id1) ? 'PASS' : 'FAIL'}`);

// Test 2: Middleware Functionality
console.log('\n2️⃣ Middleware Test:');
const mockReq = {
  headers: {},
  requestId: null,
  correlationId: null
};

const mockRes = {
  headers: {},
  setHeader: function(key, value) {
    this.headers[key] = value;
  }
};

correlationIdMiddleware(mockReq, mockRes, () => {
  console.log(`   ✅ Request ID generated: ${mockReq.requestId ? 'PASS' : 'FAIL'}`);
  console.log(`   ✅ Response header set: ${mockRes.headers['x-request-id'] ? 'PASS' : 'FAIL'}`);
  console.log(`   ✅ IDs match: ${mockReq.requestId === mockRes.headers['x-request-id'] ? 'PASS' : 'FAIL'}`);
  console.log(`   📝 Generated ID: ${mockReq.requestId}`);
});

// Test 3: Existing Header Preservation
console.log('\n3️⃣ Existing Header Test:');
const mockReq2 = {
  headers: { 'x-request-id': 'test-existing-id-123' },
  requestId: null,
  correlationId: null
};

const mockRes2 = {
  headers: {},
  setHeader: function(key, value) {
    this.headers[key] = value;
  }
};

correlationIdMiddleware(mockReq2, mockRes2, () => {
  console.log(`   ✅ Existing ID preserved: ${mockReq2.requestId === 'test-existing-id-123' ? 'PASS' : 'FAIL'}`);
  console.log(`   ✅ Response uses existing: ${mockRes2.headers['x-request-id'] === 'test-existing-id-123' ? 'PASS' : 'FAIL'}`);
});

// Test 4: Request Logger Integration
console.log('\n4️⃣ Request Logger Test:');
const mockReq3 = {
  requestId: 'test-log-id-456',
  correlationId: 'test-log-id-456',
  headers: { 'x-request-id': 'test-log-id-456' }
};

// Mock console to capture logs
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;
let logOutput = [];

console.log = (...args) => logOutput.push(['log', ...args]);
console.error = (...args) => logOutput.push(['error', ...args]);
console.warn = (...args) => logOutput.push(['warn', ...args]);

requestLogger(mockReq3, {}, () => {
  mockReq3.log.info('Test info message');
  mockReq3.log.warn('Test warning message');
  mockReq3.log.error('Test error message');
  
  // Restore console
  console.log = originalLog;
  console.error = originalError;
  console.warn = originalWarn;
  
  const hasRequestId = logOutput.some(([type, ...args]) => 
    args.some(arg => typeof arg === 'string' && arg.includes('[test-log-id-456]'))
  );
  
  console.log(`   ✅ Request ID in logs: ${hasRequestId ? 'PASS' : 'FAIL'}`);
  console.log(`   📝 Sample log: ${logOutput[0]?.[1] || 'N/A'}`);
});

// Test 5: External Service Propagation
console.log('\n5️⃣ External Service Propagation Test:');
const testRequestId = 'test-external-id-789';
const options = { 
  method: 'GET', 
  headers: { 'Content-Type': 'application/json' } 
};

const enhancedOptions = addRequestIdToHeaders(options, testRequestId);
console.log(`   ✅ Header added to options: ${enhancedOptions.headers['X-Request-ID'] === testRequestId ? 'PASS' : 'FAIL'}`);
console.log(`   ✅ Original headers preserved: ${enhancedOptions.headers['Content-Type'] === 'application/json' ? 'PASS' : 'FAIL'}`);

// Test 6: Request ID Extraction
console.log('\n6️⃣ Request ID Extraction Test:');
const extractionReq = {
  requestId: 'priority-1',
  correlationId: 'priority-2',
  headers: {
    'x-request-id': 'priority-3',
    'x-correlation-id': 'priority-4'
  }
};

const extracted = getRequestIdFromRequest(extractionReq);
console.log(`   ✅ Priority order: ${extracted === 'priority-1' ? 'PASS' : 'FAIL'}`);

delete extractionReq.requestId;
const extracted2 = getRequestIdFromRequest(extractionReq);
console.log(`   ✅ Fallback to correlationId: ${extracted2 === 'priority-2' ? 'PASS' : 'FAIL'}`);

delete extractionReq.correlationId;
const extracted3 = getRequestIdFromRequest(extractionReq);
console.log(`   ✅ Fallback to x-request-id: ${extracted3 === 'priority-3' ? 'PASS' : 'FAIL'}`);

console.log('\n🎉 All Request ID Tests Completed!');
console.log('\n📋 Next Steps:');
console.log('   1. Start your server: npm run dev');
console.log('   2. Make HTTP requests and check X-Request-ID headers');
console.log('   3. Check server logs for [request-id] prefixes');
console.log('   4. Test external service calls with propagation utilities');
