import { sendToAll, broadcastToRoom } from '../services/realtime.service.js';
import { sendToRole } from '../utils/websocketUtils.js';

// Inventory WebSocket controller
export const inventoryWsController = {
  // Emit inventory update to all connected clients
  emitInventoryUpdate: data => {
    sendToAll('inventory:update', {
      ...data,
      timestamp: new Date().toISOString(),
    });
  },

  // Emit low stock alert to relevant clients (admins and inventory managers)
  emitLowStockAlert: data => {
    // Send to all for now - in a real implementation, we'd get the io instance
    // and use sendToRole with the io parameter
    sendToAll('inventory:lowStock', {
      ...data,
      timestamp: new Date().toISOString(),
    });
  },

  // Emit to specific room (for role-based notifications)
  emitToRoom: (room, event, data) => {
    broadcastToRoom(room, event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
  },
};

export default inventoryWsController;
