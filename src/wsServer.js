import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { verifyAccessToken } from './utils/generateToken.js';
import User from './models/User.js';
import redisClient from './config/redis.js';
import { handleCollabSocket } from './services/collabService.js';

let io;

export const initWebSocket = httpServer => {
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

  // Authentication middleware for Socket.IO
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;

      if (!token) {
        console.log('WebSocket connection attempt without token from:', socket.handshake.address);
        return next(new Error('Authentication token required'));
      }

      // Verify JWT token
      let decoded;
      try {
        decoded = verifyAccessToken(token);
      } catch (err) {
        console.log(
          'Invalid WebSocket token from:',
          socket.handshake.address,
          'Token:',
          token.substring(0, 10) + '...'
        );
        return next(new Error('Invalid authentication token'));
      }

      // Fetch user from database to ensure they exist and are active
      const user = await User.findById(decoded.id).select('_id username email role createdAt');
      if (!user) {
        console.log('WebSocket user not found:', decoded.id);
        return next(new Error('User not found'));
      }

      // Attach user to socket
      socket.user = user.toObject();
      console.log(
        'WebSocket authenticated user:',
        user.username,
        'from:',
        socket.handshake.address
      );

      // Join user to personal room for direct messages
      socket.join(`user_${user._id}`);

      // Log successful connection
      await logConnectionAttempt(user._id, socket.handshake.address, 'success');

      next();
    } catch (error) {
      console.error('WebSocket authentication error:', error.message);
      next(new Error(`Authentication error: ${error.message}`));
    }
  });

  // Handle socket connections
  io.on('connection', socket => {
    console.log(`User ${socket.user.username} connected with socket ID: ${socket.id}`);

    // Emit welcome event
    socket.emit('connected', {
      message: 'Successfully connected to WebSocket server',
      userId: socket.user._id,
      username: socket.user.username,
    });

    handleCollabSocket(io, socket);

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
};

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

// Export utility functions for sending messages to specific users
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

export default io;
