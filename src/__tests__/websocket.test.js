/**
 * WebSocket authentication tests
 */
import request from 'supertest';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { socketAuth } from '../middleware/socketAuth.js';
import { generateAccessToken } from '../utils/generateToken.js';
import User from '../models/User.js';

describe('WebSocket Authentication', () => {
  let server, io, clientSocket;

  beforeEach(() => {
    server = createServer();
    io = new Server(server, {
      cors: {
        origin: '*', // Allow all origins for testing
        methods: ['GET', 'POST']
      }
    });
  });

  afterEach((done) => {
    if (clientSocket) {
      clientSocket.disconnect();
    }
    io.close();
    server.close(done);
  });

  test('should authenticate WebSocket connection with valid JWT', async () => {
    // Mock user
    const mockUser = {
      _id: 'test-user-id',
      username: 'testuser',
      email: 'test@example.com',
      role: 'patient'
    };

    // Generate a valid JWT token
    const token = generateAccessToken(mockUser);

    // Apply authentication middleware
    io.use(socketAuth);

    // Wait for server to listen
    server.listen(0, () => {
      const port = server.address().port;
      const clientIo = require('socket.io-client');
      
      clientSocket = clientIo(`http://localhost:${port}`, {
        auth: { token }
      });

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });

      clientSocket.on('connect_error', (err) => {
        done(err);
      });
    });
  });

  test('should reject WebSocket connection without token', (done) => {
    io.use(socketAuth);

    server.listen(0, () => {
      const port = server.address().port;
      const clientIo = require('socket.io-client');
      
      clientSocket = clientIo(`http://localhost:${port}`);

      clientSocket.on('connect_error', (err) => {
        expect(err.message).toBe('Authentication token required');
        done();
      });

      clientSocket.on('connect', () => {
        done(new Error('Should not connect without token'));
      });
    });
  });

  test('should reject WebSocket connection with invalid token', (done) => {
    const invalidToken = 'invalid-token-here';

    io.use(socketAuth);

    server.listen(0, () => {
      const port = server.address().port;
      const clientIo = require('socket.io-client');
      
      clientSocket = clientIo(`http://localhost:${port}`, {
        auth: { token: invalidToken }
      });

      clientSocket.on('connect_error', (err) => {
        expect(err.message).toContain('Invalid authentication token');
        done();
      });

      clientSocket.on('connect', () => {
        done(new Error('Should not connect with invalid token'));
      });
    });
  });
});

// Integration test for WebSocket with Express server
describe('WebSocket Integration Test', () => {
  test('should initialize WebSocket server with authentication', async () => {
    // This test verifies that the WebSocket initialization works correctly
    const httpServer = createServer();
    
    // Import and initialize the realtime service
    const { initRealtime } = await import('../services/realtime.service.js');
    
    expect(() => {
      initRealtime(httpServer);
    }).not.toThrow();
    
    httpServer.close();
  });
});