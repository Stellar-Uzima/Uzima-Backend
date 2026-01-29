import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import User from '../models/User.js';
import PreferenceAuditLog from '../models/PreferenceAuditLog.js';
import PreferenceService from '../services/preferenceService.js';

describe('User Preferences System', () => {
  let testUser;

  beforeEach(async () => {
    // Create a test user
    testUser = new User({
      username: 'testuser',
      email: 'test@example.com',
      password: 'hashedpassword',
      role: 'patient',
    });
    await testUser.save();
  });

  afterEach(async () => {
    // Clean up test data
    await User.deleteMany({});
    await PreferenceAuditLog.deleteMany({});
  });

  describe('User Model', () => {
    it('should have default preferences', async () => {
      const user = await User.findById(testUser._id);
      expect(user.preferences).toBeDefined();
      expect(user.preferences.notifications.email).toBe(true);
      expect(user.preferences.ui.theme).toBe('light');
      expect(user.preferences.privacy.shareData).toBe(true);
    });

    it('should allow updating preferences', async () => {
      const user = await User.findById(testUser._id);
      user.preferences.ui.theme = 'dark';
      user.preferences.notifications.email = false;
      await user.save();

      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.preferences.ui.theme).toBe('dark');
      expect(updatedUser.preferences.notifications.email).toBe(false);
    });
  });

  describe('PreferenceService', () => {
    it('should get user preferences with inheritance', async () => {
      const preferences = await PreferenceService.getUserPreferences(testUser._id);
      expect(preferences.notifications.email).toBe(true);
      expect(preferences.ui.theme).toBe('light');
    });

    it('should validate preference values', () => {
      expect(PreferenceService.validatePreference('notifications.email', true)).toBe(true);
      expect(PreferenceService.validatePreference('notifications.email', 'invalid')).toBe(false);
      expect(PreferenceService.validatePreference('ui.theme', 'dark')).toBe(true);
      expect(PreferenceService.validatePreference('ui.theme', 'invalid')).toBe(false);
    });

    it('should get specific preference by path', async () => {
      const emailPref = await PreferenceService.getPreference(testUser._id, 'notifications.email');
      expect(emailPref).toBe(true);

      const themePref = await PreferenceService.getPreference(testUser._id, 'ui.theme');
      expect(themePref).toBe('light');
    });

    it('should merge preferences with defaults', () => {
      const userPrefs = {
        notifications: { email: false },
        ui: { theme: 'dark' },
      };

      const merged = PreferenceService.mergeWithDefaults(userPrefs);
      expect(merged.notifications.email).toBe(false);
      expect(merged.notifications.push).toBe(true); // Should keep default
      expect(merged.ui.theme).toBe('dark');
      expect(merged.ui.language).toBe('en'); // Should keep default
    });
  });

  describe('PreferenceAuditLog', () => {
    it('should log preference changes', async () => {
      const logEntry = await PreferenceAuditLog.logChange({
        userId: testUser._id,
        action: 'update',
        path: 'notifications.email',
        oldValue: true,
        newValue: false,
        fullPreferences: testUser.preferences,
        performedBy: testUser._id,
      });

      expect(logEntry).toBeDefined();
      expect(logEntry.action).toBe('update');
      expect(logEntry.path).toBe('notifications.email');
      expect(logEntry.oldValue).toBe(true);
      expect(logEntry.newValue).toBe(false);
    });

    it('should get user preference history', async () => {
      // Create some log entries
      await PreferenceAuditLog.logChange({
        userId: testUser._id,
        action: 'update',
        path: 'notifications.email',
        oldValue: true,
        newValue: false,
        fullPreferences: testUser.preferences,
        performedBy: testUser._id,
      });

      await PreferenceAuditLog.logChange({
        userId: testUser._id,
        action: 'reset',
        fullPreferences: testUser.preferences,
        performedBy: testUser._id,
      });

      const history = await PreferenceAuditLog.getUserHistory(testUser._id);
      expect(history.logs).toHaveLength(2);
      expect(history.pagination.total).toBe(2);
    });

    it('should get preference statistics', async () => {
      // Create some log entries
      await PreferenceAuditLog.logChange({
        userId: testUser._id,
        action: 'update',
        path: 'notifications.email',
        oldValue: true,
        newValue: false,
        fullPreferences: testUser.preferences,
        performedBy: testUser._id,
      });

      await PreferenceAuditLog.logChange({
        userId: testUser._id,
        action: 'update',
        path: 'ui.theme',
        oldValue: 'light',
        newValue: 'dark',
        fullPreferences: testUser.preferences,
        performedBy: testUser._id,
      });

      const stats = await PreferenceAuditLog.getPreferenceStats(testUser._id);
      expect(stats).toHaveLength(1);
      expect(stats[0]._id).toBe('update');
      expect(stats[0].count).toBe(2);
    });
  });
});
