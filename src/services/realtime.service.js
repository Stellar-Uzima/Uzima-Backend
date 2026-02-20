// Updated realtime service with Socket.IO integration
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { verifyAccessToken } from '../utils/generateToken.js';
import User from '../models/User.js';
import redisClient from '../config/redis.js';
import { socketAuth } from '../middleware/socketAuth.js';

let io;

export function initRealtime(httpServer) {
  // Create Socket.IO server with Redis adapter for clustering
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Set up Redis adapter if Redis is available
  if (redisClient) {
    const pubClient = redisClient.duplicate();
    const subClient = redisClient.duplicate();

    Promise.all([pubClient.connect(), subClient.connect()])
      .then(() => {
        io.adapter(createAdapter(pubClient, subClient));
        console.log('Redis adapter connected for Socket.IO');
      })
      .catch(err => {
        console.error('Redis adapter connection failed:', err);
      });
  }

  // Use authentication middleware
  io.use(socketAuth);

  // Handle socket connections
  io.on('connection', socket => {
    console.log(`User ${socket.user.username} connected with socket ID: ${socket.id}`);

    // Emit welcome event
    socket.emit('connected', {
      message: 'Successfully connected to WebSocket server',
      userId: socket.user._id,
      username: socket.user.username,
    });

    // Handle disconnection
    socket.on('disconnect', reason => {
      console.log(`User ${socket.user.username} disconnected: ${reason}`);
      // Note: User leaves rooms automatically on disconnect
    });

    // Handle connection errors
    socket.on('error', error => {
      console.error('WebSocket error for user', socket.user.username, ':', error);
    });
  });

  return io;
}

// Helper function to log connection attempts
const logConnectionAttempt = async (userId, ipAddress, status) => {
  try {
    // This would typically log to a database or external service
    // For now, we'll just log to console
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] WebSocket ${status} - User: ${userId}, IP: ${ipAddress}`);
  } catch (error) {
    console.error('Error logging connection attempt:', error);
  }
};

// WebSocket utility functions
export const sendToUser = (userId, event, data) => {
  if (io) {
    io.to(`user_${userId}`).emit(event, data);
  }
};

export const broadcastToRoom = (room, event, data) => {
  if (io) {
    io.to(room).emit(event, data);
  }
};

export const sendToAll = (event, data) => {
  if (io) {
    io.emit(event, data);
  }
};

// Updated implementations for inventory events
export function emitInventoryUpdate(data) {
  if (io) {
    io.emit('inventory:update', {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }
}

export function emitLowStockAlert(data) {
  if (io) {
    io.emit('inventory:lowStock', {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }
}

export default io;
