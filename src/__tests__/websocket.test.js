/**
 * WebSocket Real-Time Notifications Tests
 * Tests for WebSocket server with Socket.io
 */
import request from 'supertest';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { socketAuth } from '../middleware/socketAuth.js';
import { generateAccessToken } from '../utils/generateToken.js';
import User from '../models/User.js';
import { initWebSocket, notifyUser, notifyResource, sendToAll } from '../wsServer.js';

// Dynamic import for socket.io-client to avoid module resolution issues
let ioClient;
beforeAll(async () => {
  const socketClientModule = await import('socket.io-client');
  ioClient = socketClientModule.default || socketClientModule;
});

describe('WebSocket Authentication', () => {
  let server, io, clientSocket;

  beforeEach(() => {
    server = createServer();
    io = new Server(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });
  });

  afterEach(done => {
    if (clientSocket) {
      clientSocket.disconnect();
    }
    io.close();
    server.close(done);
  });

  test('should authenticate WebSocket connection with valid JWT', async () => {
    const mockUser = {
      _id: 'test-user-id',
      username: 'testuser',
      email: 'test@example.com',
      role: 'patient',
    };

    const token = generateAccessToken(mockUser);
    io.use(socketAuth);

    server.listen(0, () => {
      const port = server.address().port;
      const clientIo = ioClient.default || ioClient;

      clientSocket = clientIo(`http://localhost:${port}`, {
        auth: { token },
      });

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });

      clientSocket.on('connect_error', err => {
        done(err);
      });
    });
  });

  test('should reject WebSocket connection without token', done => {
    io.use(socketAuth);

    server.listen(0, () => {
      const port = server.address().port;
      const clientIo = ioClient.default || ioClient;

      clientSocket = clientIo(`http://localhost:${port}`);

      clientSocket.on('connect_error', err => {
        expect(err.message).toBe('Authentication token required');
        done();
      });

      clientSocket.on('connect', () => {
        done(new Error('Should not connect without token'));
      });
    });
  });

  test('should reject WebSocket connection with invalid token', done => {
    const invalidToken = 'invalid-token-here';

    io.use(socketAuth);

    server.listen(0, () => {
      const port = server.address().port;
      const clientIo = ioClient.default || ioClient;

      clientSocket = clientIo(`http://localhost:${port}`, {
        auth: { token: invalidToken },
      });

      clientSocket.on('connect_error', err => {
        expect(err.message).toContain('Invalid authentication token');
        done();
      });

      clientSocket.on('connect', () => {
        done(new Error('Should not connect with invalid token'));
      });
    });
  });
});

describe('WebSocket Real-Time Notifications', () => {
  let httpServer;
  let io;
  let clientSocket1;
  let clientSocket2;
  let port;

  const mockUser1 = {
    _id: 'user-1',
    username: 'user1',
    email: 'user1@example.com',
    role: 'patient',
  };

  const mockUser2 = {
    _id: 'user-2',
    username: 'user2',
    email: 'user2@example.com',
    role: 'doctor',
  };

  beforeAll(done => {
    httpServer = createServer();
    io = initWebSocket(httpServer);

    httpServer.listen(0, () => {
      port = httpServer.address().port;
      done();
    });
  });

  afterAll(() => {
    if (clientSocket1) clientSocket1.disconnect();
    if (clientSocket2) clientSocket2.disconnect();
    httpServer.close();
  });

  test('should connect and receive welcome event', done => {
    const token = generateAccessToken(mockUser1);

    const clientIo = ioClient.default || ioClient;
    clientSocket1 = clientIo(`http://localhost:${port}`, {
      auth: { token },
    });

    clientSocket1.on('connected', data => {
      expect(data.message).toBe('Successfully connected to WebSocket server');
      expect(data.userId).toBe(mockUser1._id);
      expect(data.username).toBe(mockUser1.username);
      done();
    });
  });

  test('should receive record.created event via notifyUser', done => {
    const token = generateAccessToken(mockUser1);
    const clientIo = ioClient.default || ioClient;

    clientSocket1 = clientIo(`http://localhost:${port}`, {
      auth: { token },
    });

    clientSocket1.on('connected', () => {
      // Simulate sending a notification to the user
      notifyUser(mockUser1._id, 'record.created', {
        recordId: 'record-123',
        patientName: 'John Doe',
        diagnosis: 'Flu',
      });
    });

    clientSocket1.on('record.created', data => {
      expect(data.recordId).toBe('record-123');
      expect(data.patientName).toBe('John Doe');
      expect(data.diagnosis).toBe('Flu');
      expect(data.timestamp).toBeDefined();
      done();
    });
  });

  test('should receive record.updated event via notifyResource', done => {
    const token = generateAccessToken(mockUser1);
    const clientIo = ioClient.default || ioClient;

    clientSocket1 = clientIo(`http://localhost:${port}`, {
      auth: { token },
    });

    clientSocket1.on('connected', () => {
      notifyResource('resource-456', 'record.updated', {
        recordId: 'record-456',
        patientName: 'Jane Doe',
        diagnosis: 'Cold',
      });
    });

    clientSocket1.on('record.updated', data => {
      expect(data.recordId).toBe('record-456');
      expect(data.patientName).toBe('Jane Doe');
      expect(data.timestamp).toBeDefined();
      done();
    });
  });

  test('should receive system.alert event via sendToAll', done => {
    const token = generateAccessToken(mockUser1);
    const clientIo = ioClient.default || ioClient;

    clientSocket1 = clientIo(`http://localhost:${port}`, {
      auth: { token },
    });

    clientSocket1.on('connected', () => {
      sendToAll('system.alert', {
        message: 'System maintenance scheduled',
        level: 'warning',
      });
    });

    clientSocket1.on('system.alert', data => {
      expect(data.message).toBe('System maintenance scheduled');
      expect(data.level).toBe('warning');
      done();
    });
  });

  test('should isolate notifications to specific users (room isolation)', done => {
    const token1 = generateAccessToken(mockUser1);
    const token2 = generateAccessToken(mockUser2);
    const clientIo = ioClient.default || ioClient;

    let user1Received = false;
    let user2Received = false;

    clientSocket1 = clientIo(`http://localhost:${port}`, {
      auth: { token: token1 },
    });

    clientSocket2 = clientIo(`http://localhost:${port}`, {
      auth: { token: token2 },
    });

    clientSocket1.on('connected', () => {
      // Send notification only to user1
      notifyUser(mockUser1._id, 'private.notification', { message: 'Private to user1' });
    });

    clientSocket2.on('connected', () => {
      // Both connected, wait for events
    });

    clientSocket1.on('private.notification', data => {
      user1Received = true;
      expect(data.message).toBe('Private to user1');
      checkDone();
    });

    clientSocket2.on('private.notification', () => {
      user2Received = true;
      checkDone();
    });

    function checkDone() {
      // Wait a bit to ensure user2 doesn't receive the notification
      setTimeout(() => {
        expect(user1Received).toBe(true);
        expect(user2Received).toBe(false);
        done();
      }, 500);
    }
  });

  test('should handle disconnection gracefully', done => {
    const token = generateAccessToken(mockUser1);
    const clientIo = ioClient.default || ioClient;

    clientSocket1 = clientIo(`http://localhost:${port}`, {
      auth: { token },
    });

    clientSocket1.on('connect', () => {
      expect(clientSocket1.connected).toBe(true);
      clientSocket1.disconnect();
    });

    clientSocket1.on('disconnect', reason => {
      expect(reason).toBeDefined();
      done();
    });
  });
});

describe('WebSocket Integration with REST API', () => {
  test('should verify notifyUser helper exists and is exported', () => {
    expect(typeof notifyUser).toBe('function');
  });

  test('should verify notifyResource helper exists and is exported', () => {
    expect(typeof notifyResource).toBe('function');
  });

  test('should verify sendToAll helper exists and is exported', () => {
    expect(typeof sendToAll).toBe('function');
  });
});
