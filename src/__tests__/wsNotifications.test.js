import { Server } from 'socket.io';
import { createServer } from 'http';
import ioClient from 'socket.io-client';
import jwt from 'jsonwebtoken';
import { initWebSocket, notifyUser, notifyResource } from '../wsServer.js';

const TEST_SECRET = 'testsecret';
const TEST_USER_ID = 'user123';
const TEST_RESOURCE_ID = 'record456';

function getToken(userId) {
  return jwt.sign({ _id: userId }, TEST_SECRET);
}

describe('WebSocket Notifications', () => {
  let httpServer, io, clientSocket;

  beforeAll((done) => {
    httpServer = createServer();
    initWebSocket(httpServer);
    httpServer.listen(() => {
      const port = httpServer.address().port;
      clientSocket = ioClient(`http://localhost:${port}`, {
        path: '/ws',
        auth: { token: getToken(TEST_USER_ID) },
        query: { resourceId: TEST_RESOURCE_ID, eventTypes: 'recordCreated,paymentConfirmed' },
        transports: ['websocket'],
      });
      clientSocket.on('connect', done);
    });
  });

  afterAll(() => {
    clientSocket.close();
    httpServer.close();
  });

  it('should receive recordCreated event for user', (done) => {
    clientSocket.once('recordCreated', (payload) => {
      expect(payload.event).toBe('recordCreated');
      expect(payload._id).toBe(TEST_RESOURCE_ID);
      expect(payload.createdBy).toBe(TEST_USER_ID);
      done();
    });
    notifyUser(TEST_USER_ID, 'recordCreated', {
      _id: TEST_RESOURCE_ID,
      createdBy: TEST_USER_ID,
      event: 'recordCreated',
    });
  });

  it('should receive paymentConfirmed event for resource', (done) => {
    clientSocket.once('paymentConfirmed', (payload) => {
      expect(payload.event).toBe('paymentConfirmed');
      expect(payload._id).toBe(TEST_RESOURCE_ID);
      done();
    });
    notifyResource(TEST_RESOURCE_ID, 'paymentConfirmed', {
      _id: TEST_RESOURCE_ID,
      createdBy: TEST_USER_ID,
      event: 'paymentConfirmed',
    });
  });

  it('should respond to ping with pong', (done) => {
    clientSocket.once('ping', () => {
      clientSocket.emit('pong');
      done();
    });
    // Simulate server ping
    clientSocket.emit('ping');
  });
});
