import { verifyAccessToken } from '../utils/generateToken.js';
import User from '../models/User.js';

/**
 * Socket.IO authentication middleware
 * Verifies JWT token from handshake and attaches user to socket
 */
export const socketAuth = async (socket, next) => {
  try {
    // Extract token from handshake (can be in auth.token or query.token)
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
      console.log('Invalid WebSocket token from:', socket.handshake.address, 'Token:', token.substring(0, 10) + '...');
      return next(new Error('Invalid authentication token'));
    }

    // Fetch user from database to ensure they exist and are active
    const user = await User.findById(decoded.id).select('_id username email role createdAt isActive');
    
    // Check if user is active
    if (!user) {
      console.log('WebSocket user not found:', decoded.id);
      return next(new Error('User not found'));
    }
    
    if (user.isActive === false) {
      console.log('WebSocket connection attempt by inactive user:', decoded.id);
      return next(new Error('Account is deactivated'));
    }

    // Attach user to socket
    socket.user = user.toObject();
    console.log('WebSocket authenticated user:', user.username, 'from:', socket.handshake.address);

    // Join user to personal room for direct messages
    socket.join(`user_${user._id}`);
    
    // Log successful connection
    await logConnectionAttempt(user._id, socket.handshake.address, 'success');

    next();
  } catch (error) {
    console.error('WebSocket authentication error:', error.message);
    next(new Error(`Authentication error: ${error.message}`));
  }
};

// Helper function to log connection attempts
const logConnectionAttempt = async (userId, ipAddress, status) => {
  try {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] WebSocket ${status} - User: ${userId}, IP: ${ipAddress}`);
    
    // In a production environment, you might want to log this to a database
    // or external logging service
  } catch (error) {
    console.error('Error logging connection attempt:', error);
  }
};

export default socketAuth;