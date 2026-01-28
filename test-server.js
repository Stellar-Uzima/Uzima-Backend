#!/usr/bin/env node

/**
 * Simple Request ID Test Server
 * Demonstrates request ID functionality without full app dependencies
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import cors from 'cors';

// Middleware to attach a request ID to each request for distributed tracing
const correlationIdMiddleware = (req, res, next) => {
  const headerKey = 'x-request-id';
  const requestId = req.headers[headerKey] || uuidv4();
  req.requestId = requestId;
  req.correlationId = requestId; // Keep for backward compatibility
  res.setHeader(headerKey, requestId);
  next();
};

// Request Logger Middleware
const requestLogger = (req, res, next) => {
  const requestId =
    req.requestId ||
    req.correlationId ||
    req.headers['x-request-id'] ||
    req.headers['x-correlation-id'];

  req.log = {
    info: msg => {
      const logData = {
        requestId,
        timestamp: new Date().toISOString(),
        level: 'info',
        message: typeof msg === 'object' ? JSON.stringify(msg) : msg,
      };
      console.log(`[${logData.requestId || 'NO-ID'}]`, logData);
    },
    error: msg => {
      const logData = {
        requestId,
        timestamp: new Date().toISOString(),
        level: 'error',
        message: typeof msg === 'object' ? JSON.stringify(msg) : msg,
      };
      console.error(`[${logData.requestId || 'NO-ID'}]`, logData);
    },
    warn: msg => {
      const logData = {
        requestId,
        timestamp: new Date().toISOString(),
        level: 'warn',
        message: typeof msg === 'object' ? JSON.stringify(msg) : msg,
      };
      console.warn(`[${logData.requestId || 'NO-ID'}]`, logData);
    },
  };
  next();
};

// Create test app
const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(correlationIdMiddleware);
app.use(requestLogger);

// Test endpoints
app.get('/test-request-id', (req, res) => {
  req.log.info('Processing test request');
  res.json({
    message: 'Request ID test successful',
    requestId: req.requestId,
    correlationId: req.correlationId,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health', (req, res) => {
  req.log.info('Health check requested');
  res.json({
    status: 'healthy',
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/test', (req, res) => {
  req.log.info('POST request received');
  req.log.warn('This is a warning message');
  res.json({
    message: 'POST test successful',
    receivedData: req.body,
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
  });
});

// Error handler for testing
app.get('/api/error', (req, res) => {
  req.log.error('Simulated error occurred');
  res.status(500).json({
    error: 'Test error',
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
  });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Request ID Test Server running on http://localhost:${port}`);
  console.log(`📋 Available endpoints:`);
  console.log(`   GET  /test-request-id  - Basic request ID test`);
  console.log(`   GET  /api/health      - Health check with request ID`);
  console.log(`   POST /api/test        - POST test with request ID`);
  console.log(`   GET  /api/error       - Error test with request ID`);
  console.log(`\n🧪 Test with curl:`);
  console.log(`   curl -i http://localhost:${port}/api/health`);
  console.log(`   curl -i -H "X-Request-ID: test-123" http://localhost:${port}/api/health`);
  console.log(`\n📝 Watch console for [request-id] prefixed logs`);
});
