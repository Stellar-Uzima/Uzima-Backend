/**
 * Utility functions for WebSocket operations
 */

// Function to get connected user count
export const getConnectedUserCount = (io) => {
  if (!io) return 0;
  let count = 0;
  for (const roomName of io.sockets.adapter.rooms.keys()) {
    if (roomName.startsWith('user_')) {
      count++;
    }
  }
  return count;
};

// Function to get all connected users
export const getConnectedUsers = (io) => {
  if (!io) return [];
  const users = [];
  for (const [id, socket] of io.sockets.sockets) {
    if (socket.user) {
      users.push({
        id: socket.user._id,
        username: socket.user.username,
        socketId: id,
        role: socket.user.role
      });
    }
  }
  return users;
};

// Function to check if a user is connected
export const isUserConnected = (io, userId) => {
  if (!io) return false;
  const roomName = `user_${userId}`;
  const room = io.sockets.adapter.rooms.get(roomName);
  return room && room.size > 0;
};

// Function to send a private message to a user
export const sendPrivateMessage = (io, userId, event, data) => {
  if (!io) return false;
  const roomName = `user_${userId}`;
  io.to(roomName).emit(event, {
    ...data,
    timestamp: new Date().toISOString(),
    to: userId
  });
  return true;
};

// Function to send a message to users with specific roles
export const sendToRole = (io, role, event, data) => {
  if (!io) return;
  
  for (const [id, socket] of io.sockets.sockets) {
    if (socket.user && socket.user.role === role) {
      socket.emit(event, {
        ...data,
        timestamp: new Date().toISOString(),
        to: socket.user.username,
        role: role
      });
    }
  }
};

// Function to broadcast to all except sender
export const broadcastToOthers = (socket, event, data) => {
  if (!socket || !socket.broadcast) return;
  socket.broadcast.emit(event, {
    ...data,
    timestamp: new Date().toISOString(),
    from: socket.user ? socket.user.username : 'unknown'
  });
};

export default {
  getConnectedUserCount,
  getConnectedUsers,
  isUserConnected,
  sendPrivateMessage,
  sendToRole,
  broadcastToOthers
};