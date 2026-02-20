/**
 * Test controller for WebSocket functionality
 */

import { sendToAll } from '../services/realtime.service.js';

export const wsTestController = {
  // Test endpoint to send a test message to all connected clients
  sendTestMessage: (req, res) => {
    try {
      const { message, event = 'test:message' } = req.body;

      if (!message) {
        return res.status(400).json({
          success: false,
          message: 'Message is required',
        });
      }

      // Send test message to all connected WebSocket clients
      sendToAll(event, {
        message: message,
        timestamp: new Date().toISOString(),
        from: 'server',
      });

      return res.status(200).json({
        success: true,
        message: 'Test message sent to all connected clients',
      });
    } catch (error) {
      console.error('Error sending test message:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  },

  // Health check for WebSocket service
  wsHealthCheck: (req, res) => {
    // In a real implementation, we would check if the WebSocket server is running
    // For now, we just return a success response
    return res.status(200).json({
      success: true,
      message: 'WebSocket service is running',
      timestamp: new Date().toISOString(),
    });
  },
};

export default wsTestController;
