import User from '../models/User.js';
import ApiResponse from '../utils/apiResponse.js';
import {
  preferencesSchema,
  preferenceUpdateSchema,
  preferenceMergeSchema,
} from '../validations/preferenceValidators.js';
import transactionLog from '../models/transactionLog.js';
import PreferenceAuditLog from '../models/PreferenceAuditLog.js';
import PreferenceService from '../services/preferenceService.js';
import { withTransaction } from '../utils/withTransaction.js';

const preferenceController = {
  // Get user preferences
  getPreferences: async (req, res) => {
    try {
      const preferences = await PreferenceService.getUserPreferences(req.user._id);
      return ApiResponse.success(res, preferences, 'Preferences retrieved successfully');
    } catch (error) {
      return ApiResponse.error(res, error.message, 500);
    }
  },

  // Update specific preference using dot notation
  updatePreference: async (req, res) => {
    try {
      const { error } = preferenceUpdateSchema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      const { path, value } = req.body;
      const userId = req.user._id;

      // Validate preference value using PreferenceService
      if (!PreferenceService.validatePreference(path, value)) {
        return ApiResponse.error(res, 'Invalid preference value for the specified path', 400);
      }

      await withTransaction(async session => {
        const user = await User.findOne({ _id: userId, deletedAt: null }).session(session);
        if (!user) {
          throw new Error('User not found');
        }

        // Get the old value for audit trail
        const oldValue = getNestedValue(user.preferences, path);

        // Validate the updated preferences structure
        const updatedPreferences = { ...user.preferences };
        setNestedValue(updatedPreferences, path, value);

        const { error: validationError } = preferencesSchema.validate(updatedPreferences);
        if (validationError) {
          throw new Error(`Invalid preference value: ${validationError.details[0].message}`);
        }

        // Update the preference
        user.preferences = updatedPreferences;
        await user.save({ session });

        // Log to transaction log
        await transactionLog.create(
          [
            {
              action: 'update_preference',
              resource: 'User',
              resourceId: userId,
              performedBy: userId,
              timestamp: new Date(),
              details: `Updated preference: ${path} from ${JSON.stringify(oldValue)} to ${JSON.stringify(value)}`,
              metadata: {
                path,
                oldValue,
                newValue: value,
              },
            },
          ],
          { session }
        );

        // Log to preference audit log
        await PreferenceAuditLog.logChange({
          userId,
          action: 'update',
          path,
          oldValue,
          newValue: value,
          fullPreferences: updatedPreferences,
          performedBy: userId,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          sessionId: req.sessionID,
          reason: req.body.reason || null,
          metadata: {
            endpoint: req.originalUrl,
            method: req.method,
          },
        });
      });

      return ApiResponse.success(res, null, 'Preference updated successfully');
    } catch (error) {
      const status = error.message.includes('not found')
        ? 404
        : error.message.includes('Invalid preference')
          ? 400
          : 500;
      return ApiResponse.error(res, error.message, status);
    }
  },

  // Merge preferences (partial update)
  mergePreferences: async (req, res) => {
    try {
      const { error } = preferenceMergeSchema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      const { preferences: newPreferences } = req.body;
      const userId = req.user._id;

      await withTransaction(async session => {
        const user = await User.findOne({ _id: userId, deletedAt: null }).session(session);
        if (!user) {
          throw new Error('User not found');
        }

        // Merge with existing preferences
        const mergedPreferences = mergeDeep(user.preferences, newPreferences);

        // Validate the merged preferences
        const { error: validationError } = preferencesSchema.validate(mergedPreferences);
        if (validationError) {
          throw new Error(`Invalid preferences: ${validationError.details[0].message}`);
        }

        // Update preferences
        user.preferences = mergedPreferences;
        await user.save({ session });

        // Log the change
        await transactionLog.create(
          [
            {
              action: 'merge_preferences',
              resource: 'User',
              resourceId: userId,
              performedBy: userId,
              timestamp: new Date(),
              details: 'Merged user preferences',
              metadata: {
                oldPreferences: user.preferences,
                newPreferences,
                mergedPreferences,
              },
            },
          ],
          { session }
        );
      });

      return ApiResponse.success(res, null, 'Preferences merged successfully');
    } catch (error) {
      const status = error.message.includes('not found')
        ? 404
        : error.message.includes('Invalid preferences')
          ? 400
          : 500;
      return ApiResponse.error(res, error.message, status);
    }
  },

  // Reset preferences to defaults
  resetPreferences: async (req, res) => {
    try {
      const userId = req.user._id;

      await withTransaction(async session => {
        const user = await User.findOne({ _id: userId, deletedAt: null }).session(session);
        if (!user) {
          throw new Error('User not found');
        }

        const oldPreferences = { ...user.preferences };

        // Reset to defaults
        user.preferences = user.schema.path('preferences').getDefault();
        await user.save({ session });

        // Log the change
        await transactionLog.create(
          [
            {
              action: 'reset_preferences',
              resource: 'User',
              resourceId: userId,
              performedBy: userId,
              timestamp: new Date(),
              details: 'Reset preferences to defaults',
              metadata: {
                oldPreferences,
                newPreferences: user.preferences,
              },
            },
          ],
          { session }
        );
      });

      return ApiResponse.success(res, null, 'Preferences reset to defaults successfully');
    } catch (error) {
      const status = error.message.includes('not found') ? 404 : 500;
      return ApiResponse.error(res, error.message, status);
    }
  },

  // Get preference change history
  getPreferenceHistory: async (req, res) => {
    try {
      const { page = 1, limit = 20, action, path, startDate, endDate } = req.query;
      const userId = req.user._id;

      const history = await PreferenceAuditLog.getUserHistory(userId, {
        page: parseInt(page),
        limit: parseInt(limit),
        action,
        path,
        startDate,
        endDate,
      });

      return ApiResponse.success(res, history, 'Preference history retrieved successfully');
    } catch (error) {
      return ApiResponse.error(res, error.message, 500);
    }
  },

  // Get preference statistics
  getPreferenceStats: async (req, res) => {
    try {
      const { timeRange = '30d' } = req.query;
      const userId = req.user._id;

      const stats = await PreferenceAuditLog.getPreferenceStats(userId, timeRange);

      return ApiResponse.success(res, stats, 'Preference statistics retrieved successfully');
    } catch (error) {
      return ApiResponse.error(res, error.message, 500);
    }
  },

  // Export preferences
  exportPreferences: async (req, res) => {
    try {
      const userId = req.user._id;
      const exportData = await PreferenceService.exportUserPreferences(userId);

      return ApiResponse.success(res, exportData, 'Preferences exported successfully');
    } catch (error) {
      return ApiResponse.error(res, error.message, 500);
    }
  },

  // Import preferences
  importPreferences: async (req, res) => {
    try {
      const { preferences } = req.body;
      const userId = req.user._id;

      if (!preferences || typeof preferences !== 'object') {
        return ApiResponse.error(res, 'Invalid preferences data', 400);
      }

      await withTransaction(async session => {
        const user = await User.findOne({ _id: userId, deletedAt: null }).session(session);
        if (!user) {
          throw new Error('User not found');
        }

        const oldPreferences = { ...user.preferences };
        const importedPreferences = await PreferenceService.importUserPreferences(
          userId,
          preferences
        );

        // Log the import
        await PreferenceAuditLog.logChange({
          userId,
          action: 'merge',
          oldValue: oldPreferences,
          newValue: importedPreferences,
          fullPreferences: importedPreferences,
          performedBy: userId,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          sessionId: req.sessionID,
          reason: 'Imported preferences',
          metadata: {
            endpoint: req.originalUrl,
            method: req.method,
            importSource: 'manual',
          },
        });
      });

      return ApiResponse.success(res, null, 'Preferences imported successfully');
    } catch (error) {
      const status = error.message.includes('not found')
        ? 404
        : error.message.includes('Invalid')
          ? 400
          : 500;
      return ApiResponse.error(res, error.message, status);
    }
  },
};

// Helper functions for nested object operations
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}

function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  const target = keys.reduce((current, key) => {
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    return current[key];
  }, obj);
  target[lastKey] = value;
}

function mergeDeep(target, source) {
  const output = { ...target };

  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = mergeDeep(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }

  return output;
}

function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

export default preferenceController;
