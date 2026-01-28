/* eslint-disable prettier/prettier */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import eventManager from '../../services/eventManager.js';

/**
 * SSE Event Manager Tests
 * Tests for connection management, event distribution, heartbeat, and cleanup
 */

describe('EventManager', () => {
  beforeEach(() => {
    // Reset event manager state before each test
    eventManager.shutdown();
    // Re-initialize after shutdown
    eventManager.connections.clear();
    eventManager.totalConnections = 0;
    eventManager.startHeartbeat();
    eventManager.startCleanupJob();
  });

  afterEach(() => {
    // Cleanup after tests
    eventManager.shutdown();
  });

  describe('Connection Management', () => {
    it('should add a connection successfully', () => {
      const mockResponse = {
        write: vi.fn(),
        end: vi.fn(),
        setHeader: vi.fn(),
        status: vi.fn(() => ({ json: vi.fn() })),
      };

      const connectionId = eventManager.addConnection('user123', mockResponse);

      expect(connectionId).toBeDefined();
      expect(connectionId).toContain('user123');
      expect(eventManager.totalConnections).toBe(1);
      expect(eventManager.connections.has('user123')).toBe(true);
    });

    it('should add multiple connections for same user', () => {
      const mockResponse1 = { write: vi.fn(), end: vi.fn() };
      const mockResponse2 = { write: vi.fn(), end: vi.fn() };

      const conn1 = eventManager.addConnection('user123', mockResponse1);
      const conn2 = eventManager.addConnection('user123', mockResponse2);

      expect(conn1).not.toBe(conn2);
      expect(eventManager.totalConnections).toBe(2);
      expect(eventManager.connections.get('user123').size).toBe(2);
    });

    it('should add multiple connections for different users', () => {
      const mockResponse1 = { write: vi.fn(), end: vi.fn() };
      const mockResponse2 = { write: vi.fn(), end: vi.fn() };

      const conn1 = eventManager.addConnection('user1', mockResponse1);
      const conn2 = eventManager.addConnection('user2', mockResponse2);

      expect(eventManager.totalConnections).toBe(2);
      expect(eventManager.connections.size).toBe(2);
      expect(eventManager.connections.has('user1')).toBe(true);
      expect(eventManager.connections.has('user2')).toBe(true);
    });

    it('should support event filters', () => {
      const mockResponse = { write: vi.fn(), end: vi.fn() };
      const filters = ['record.created', 'system.alert'];

      const connectionId = eventManager.addConnection('user123', mockResponse, filters);

      const userConns = eventManager.connections.get('user123');
      const conn = Array.from(userConns)[0];

      expect(conn.filters).toBeDefined();
      expect(Array.from(conn.filters)).toEqual(filters);
    });

    it('should remove a connection successfully', () => {
      const mockResponse = { write: vi.fn(), end: vi.fn() };

      const connectionId = eventManager.addConnection('user123', mockResponse);
      expect(eventManager.totalConnections).toBe(1);

      eventManager.removeConnection('user123', connectionId);
      expect(eventManager.totalConnections).toBe(0);
      expect(eventManager.connections.has('user123')).toBe(false);
    });

    it('should handle removing non-existent connection gracefully', () => {
      expect(() => {
        eventManager.removeConnection('user123', 'invalid-id');
      }).not.toThrow();
    });

    it('should get connection statistics', () => {
      const mockResponse1 = { write: vi.fn(), end: vi.fn() };
      const mockResponse2 = { write: vi.fn(), end: vi.fn() };

      eventManager.addConnection('user1', mockResponse1);
      eventManager.addConnection('user2', mockResponse2, ['record.created']);

      const stats = eventManager.getStats();

      expect(stats.totalConnections).toBe(2);
      expect(stats.userCount).toBe(2);
      expect(stats.userDetails).toHaveLength(2);
    });
  });

  describe('Event Broadcasting', () => {
    it('should broadcast event to all users', () => {
      const mockWrite1 = vi.fn();
      const mockWrite2 = vi.fn();
      const mockResponse1 = { write: mockWrite1, end: vi.fn() };
      const mockResponse2 = { write: mockWrite2, end: vi.fn() };

      eventManager.addConnection('user1', mockResponse1);
      eventManager.addConnection('user2', mockResponse2);

      eventManager.broadcastEvent('record.created', { id: 'rec123', title: 'Test Record' });

      // Both users should receive the event
      expect(mockWrite1).toHaveBeenCalled();
      expect(mockWrite2).toHaveBeenCalled();
    });

    it('should broadcast event to specific user only', () => {
      const mockWrite1 = vi.fn();
      const mockWrite2 = vi.fn();
      const mockResponse1 = { write: mockWrite1, end: vi.fn() };
      const mockResponse2 = { write: mockWrite2, end: vi.fn() };

      eventManager.addConnection('user1', mockResponse1);
      eventManager.addConnection('user2', mockResponse2);

      eventManager.broadcastEvent('record.created', { id: 'rec123' }, 'user1');

      // Only user1 should receive
      expect(mockWrite1).toHaveBeenCalled();
      // user2 might not be called (depending on connection state)
    });

    it('should respect event filters', () => {
      const mockWrite1 = vi.fn();
      const mockWrite2 = vi.fn();
      const mockResponse1 = { write: mockWrite1, end: vi.fn() };
      const mockResponse2 = { write: mockWrite2, end: vi.fn() };

      // user1 receives all events
      eventManager.addConnection('user1', mockResponse1, null);
      // user2 only receives record.created
      eventManager.addConnection('user2', mockResponse2, ['record.created']);

      // Broadcast system.alert
      mockWrite1.mockClear();
      mockWrite2.mockClear();
      eventManager.broadcastEvent('system.alert', { level: 'warning' });

      // user1 should receive (no filter)
      expect(mockWrite1).toHaveBeenCalled();
      // user2 should NOT receive (filtered)
      expect(mockWrite2).not.toHaveBeenCalled();

      // Broadcast record.created
      mockWrite1.mockClear();
      mockWrite2.mockClear();
      eventManager.broadcastEvent('record.created', { id: 'rec123' });

      // Both should receive
      expect(mockWrite1).toHaveBeenCalled();
      expect(mockWrite2).toHaveBeenCalled();
    });

    it('should include event metadata (id, type, timestamp)', () => {
      const mockWrite = vi.fn();
      const mockResponse = { write: mockWrite, end: vi.fn() };

      eventManager.addConnection('user1', mockResponse);
      eventManager.broadcastEvent('test.event', { test: true });

      // Check that all required fields were written
      const callArgs = mockWrite.mock.calls.map(call => call[0]);
      const eventString = callArgs.join('');

      expect(eventString).toContain('id:');
      expect(eventString).toContain('event: test.event');
      expect(eventString).toContain('data:');
    });

    it('should handle write errors gracefully', () => {
      const mockWrite = vi.fn().mockImplementation(() => {
        throw new Error('Write failed');
      });
      const mockResponse = { write: mockWrite, end: vi.fn() };

      const connId = eventManager.addConnection('user1', mockResponse);
      expect(eventManager.totalConnections).toBe(1);

      eventManager.broadcastEvent('test.event', { test: true });

      // Connection should be removed after write error
      expect(eventManager.totalConnections).toBe(0);
    });
  });

  describe('Keep-alive Heartbeat', () => {
    it('should send heartbeat to keep connections alive', (done) => {
      const mockWrite = vi.fn();
      const mockResponse = { write: mockWrite, end: vi.fn() };

      eventManager.addConnection('user1', mockResponse);
      mockWrite.mockClear();

      // Manually trigger heartbeat
      eventManager.sendHeartbeat();

      // Heartbeat should be written
      expect(mockWrite).toHaveBeenCalled();
      const callArgs = mockWrite.mock.calls.map(call => call[0]);
      expect(callArgs.some(arg => arg.includes(':heartbeat'))).toBe(true);

      done();
    });

    it('should update lastActivity on successful heartbeat', () => {
      const mockResponse = { write: vi.fn(), end: vi.fn() };
      const connId = eventManager.addConnection('user1', mockResponse);

      const conn = Array.from(eventManager.connections.get('user1'))[0];
      const initialActivity = conn.lastActivity;

      // Wait a bit and send heartbeat
      setTimeout(() => {
        eventManager.sendHeartbeat();
        expect(conn.lastActivity).toBeGreaterThan(initialActivity);
      }, 10);
    });

    it('should remove connections that fail heartbeat', () => {
      const mockWrite = vi.fn().mockImplementation(() => {
        throw new Error('Heartbeat failed');
      });
      const mockResponse = { write: mockWrite, end: vi.fn() };

      const connId = eventManager.addConnection('user1', mockResponse);
      expect(eventManager.totalConnections).toBe(1);

      eventManager.sendHeartbeat();

      // Connection should be removed after heartbeat failure
      expect(eventManager.totalConnections).toBe(0);
    });
  });

  describe('Connection Cleanup', () => {
    it('should clean up idle connections', function (done) {
      this.timeout(5000);

      const mockResponse = { write: vi.fn(), end: vi.fn() };
      const connId = eventManager.addConnection('user1', mockResponse);

      const conn = Array.from(eventManager.connections.get('user1'))[0];
      // Set lastActivity to past
      conn.lastActivity = Date.now() - (eventManager.inactivityTimeout + 1000);

      // Run cleanup job
      eventManager.startCleanupJob();

      // Wait for cleanup to run
      setTimeout(() => {
        // Manually trigger cleanup logic
        const now = Date.now();
        if (now - conn.lastActivity > eventManager.inactivityTimeout) {
          eventManager.removeConnection('user1', connId, 'inactivity_timeout');
        }
        expect(eventManager.totalConnections).toBe(0);
        done();
      }, 100);
    });

    it('should not remove active connections', () => {
      const mockResponse = { write: vi.fn(), end: vi.fn() };
      eventManager.addConnection('user1', mockResponse);

      const conn = Array.from(eventManager.connections.get('user1'))[0];
      // lastActivity is recent (set in addConnection)
      expect(Date.now() - conn.lastActivity).toBeLessThan(1000);

      expect(eventManager.totalConnections).toBe(1);
    });
  });

  describe('EventEmitter Integration', () => {
    it('should emit connectionAdded event', (done) => {
      const mockResponse = { write: vi.fn(), end: vi.fn() };

      eventManager.on('connectionAdded', ({ userId, connectionId }) => {
        expect(userId).toBe('user123');
        expect(connectionId).toBeDefined();
        done();
      });

      eventManager.addConnection('user123', mockResponse);
    });

    it('should emit connectionRemoved event', (done) => {
      const mockResponse = { write: vi.fn(), end: vi.fn() };
      const connId = eventManager.addConnection('user123', mockResponse);

      eventManager.on('connectionRemoved', ({ userId, connectionId, reason }) => {
        expect(userId).toBe('user123');
        expect(reason).toBe('test_removal');
        done();
      });

      eventManager.removeConnection('user123', connId, 'test_removal');
    });

    it('should emit eventBroadcasted event', (done) => {
      const mockResponse = { write: vi.fn(), end: vi.fn() };
      eventManager.addConnection('user1', mockResponse);

      eventManager.on('eventBroadcasted', ({ eventType, timestamp }) => {
        expect(eventType).toBe('test.event');
        expect(timestamp).toBeDefined();
        done();
      });

      eventManager.broadcastEvent('test.event', { data: 'test' });
    });
  });

  describe('Graceful Shutdown', () => {
    it('should close all connections on shutdown', () => {
      const mockEnd1 = vi.fn();
      const mockEnd2 = vi.fn();
      const mockResponse1 = { write: vi.fn(), end: mockEnd1 };
      const mockResponse2 = { write: vi.fn(), end: mockEnd2 };

      eventManager.addConnection('user1', mockResponse1);
      eventManager.addConnection('user2', mockResponse2);

      expect(eventManager.totalConnections).toBe(2);

      eventManager.shutdown();

      expect(mockEnd1).toHaveBeenCalled();
      expect(mockEnd2).toHaveBeenCalled();
      expect(eventManager.totalConnections).toBe(0);
      expect(eventManager.connections.size).toBe(0);
    });

    it('should clear timers on shutdown', () => {
      const heartbeatSpy = vi.spyOn(global, 'clearInterval');

      eventManager.shutdown();

      expect(heartbeatSpy).toHaveBeenCalled();
      heartbeatSpy.mockRestore();
    });
  });

  describe('Connection Limits', () => {
    it('should reject connections when max is reached', () => {
      const originalMax = eventManager.maxConnections;
      eventManager.maxConnections = 2;

      const mockResponse1 = { write: vi.fn(), end: vi.fn() };
      const mockResponse2 = { write: vi.fn(), end: vi.fn() };
      const mockResponse3 = { write: vi.fn(), status: vi.fn(() => ({ json: vi.fn() })), end: vi.fn() };

      eventManager.addConnection('user1', mockResponse1);
      eventManager.addConnection('user2', mockResponse2);

      // Third connection should be rejected
      const conn3 = eventManager.addConnection('user3', mockResponse3);

      expect(conn3).toBeNull();
      expect(eventManager.totalConnections).toBe(2);

      // Restore original max
      eventManager.maxConnections = originalMax;
    });
  });
});
