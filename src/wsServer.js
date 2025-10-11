import http from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import jwt from 'jsonwebtoken';

let io;

export async function initWebSocket(server) {
  io = new Server(server, {
    path: '/ws',
    transports: ['websocket', 'polling'],
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  // Redis adapter for scalability
  if (process.env.REDIS_URL) {
    const pubClient = createClient({ host: process.env.REDIS_HOST, port: process.env.REDIS_PORT });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
}

  // Auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const user = jwt.verify(token, process.env.JWT_SECRET || 'secret');
      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    // Join userId room
    if (socket.user && socket.user._id) {
      socket.join(`user:${socket.user._id}`);
    }
    // Join resourceId room if provided
    const { resourceId, eventTypes } = socket.handshake.query;
    if (resourceId) {
      socket.join(`resource:${resourceId}`);
    }

    // Event type filtering: client can specify eventTypes (comma-separated)
    if (eventTypes) {
      socket.eventTypes = eventTypes.split(',');
    }

    // Auto-ping/pong every 30s
    const pingInterval = setInterval(() => {
      socket.emit('ping');
    }, 30000);

    socket.on('pong', () => {
      // Client responded to ping
    });

    // Reconnect hint
    socket.on('reconnect_attempt', () => {
      socket.emit('reconnect_hint', { message: 'Attempting to reconnect...' });
    });

    // Handle disconnects
    socket.on('disconnect', (reason) => {
      clearInterval(pingInterval);
      // Optionally log disconnects
    });
  });
}

// Broadcast helpers
// Notify a single user
export function notifyUser(userId, event, data) {
  io?.to(`user:${userId}`).emit(event, data);
}
// Notify multiple users
export function notifyUsers(userIds, event, data) {
  userIds.forEach(id => notifyUser(id, event, data));
}
// Notify a single resource
export function notifyResource(resourceId, event, data) {
  io?.to(`resource:${resourceId}`).emit(event, data);
}
// Notify multiple resources
export function notifyResources(resourceIds, event, data) {
  resourceIds.forEach(id => notifyResource(id, event, data));
}
