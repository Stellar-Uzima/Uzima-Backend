import User from '../models/User.js';

class PreferenceService {
  // Global default preferences (system-wide)
  static globalDefaults = {
    notifications: {
      email: true,
      push: true,
      sms: false,
      marketing: false,
      appointments: true,
      prescriptions: true,
      labResults: true,
    },
    ui: {
      theme: 'light',
      language: 'en',
      timezone: 'UTC',
      dateFormat: 'MM/DD/YYYY',
      timeFormat: '12h',
    },
    privacy: {
      profileVisibility: 'public',
      shareData: true,
      analytics: true,
    },
    accessibility: {
      fontSize: 'medium',
      highContrast: false,
      screenReader: false,
    },
  };

  // Get user preferences with inheritance (global -> user)
  static async getUserPreferences(userId) {
    try {
      const user = await User.findOne({ _id: userId, deletedAt: null });
      if (!user) {
        throw new Error('User not found');
      }

      // Merge global defaults with user preferences
      return this.mergeWithDefaults(user.preferences);
    } catch (error) {
      throw new Error(`Failed to get user preferences: ${error.message}`);
    }
  }

  // Merge user preferences with global defaults (inheritance)
  static mergeWithDefaults(userPreferences) {
    return this.mergeDeep(this.globalDefaults, userPreferences || {});
  }

  // Get specific preference with inheritance
  static async getPreference(userId, path) {
    try {
      const preferences = await this.getUserPreferences(userId);
      return this.getNestedValue(preferences, path);
    } catch (error) {
      throw new Error(`Failed to get preference: ${error.message}`);
    }
  }

  // Validate preference value against schema
  static validatePreference(path, value) {
    // This would integrate with Joi validation
    // For now, basic validation based on path patterns
    const pathParts = path.split('.');

    if (pathParts[0] === 'notifications') {
      return typeof value === 'boolean';
    }

    if (pathParts[0] === 'ui') {
      if (pathParts[1] === 'theme') {
        return ['light', 'dark', 'auto'].includes(value);
      }
      if (pathParts[1] === 'language') {
        return ['en', 'es', 'fr', 'de', 'it', 'pt', 'sw', 'ar', 'hi', 'zh'].includes(value);
      }
      if (pathParts[1] === 'timeFormat') {
        return ['12h', '24h'].includes(value);
      }
      if (pathParts[1] === 'dateFormat') {
        return ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY'].includes(value);
      }
    }

    if (pathParts[0] === 'privacy') {
      if (pathParts[1] === 'profileVisibility') {
        return ['public', 'private', 'friends'].includes(value);
      }
      return typeof value === 'boolean';
    }

    if (pathParts[0] === 'accessibility') {
      if (pathParts[1] === 'fontSize') {
        return ['small', 'medium', 'large', 'extra-large'].includes(value);
      }
      return typeof value === 'boolean';
    }

    return true; // Allow unknown paths for extensibility
  }

  // Get preferences for multiple users (batch operation)
  static async getMultipleUserPreferences(userIds) {
    try {
      const users = await User.find({
        _id: { $in: userIds },
        deletedAt: null,
      }).select('_id preferences');

      const result = {};
      users.forEach(user => {
        result[user._id] = this.mergeWithDefaults(user.preferences);
      });

      return result;
    } catch (error) {
      throw new Error(`Failed to get multiple user preferences: ${error.message}`);
    }
  }

  // Export user preferences (for backup/migration)
  static async exportUserPreferences(userId) {
    try {
      const preferences = await this.getUserPreferences(userId);
      return {
        userId,
        preferences,
        exportedAt: new Date().toISOString(),
        version: '1.0',
      };
    } catch (error) {
      throw new Error(`Failed to export user preferences: ${error.message}`);
    }
  }

  // Import user preferences (for backup/migration)
  static async importUserPreferences(userId, preferencesData) {
    try {
      const user = await User.findOne({ _id: userId, deletedAt: null });
      if (!user) {
        throw new Error('User not found');
      }

      // Validate imported preferences
      const mergedPreferences = this.mergeWithDefaults(preferencesData);

      // Update user preferences
      user.preferences = preferencesData;
      await user.save();

      return mergedPreferences;
    } catch (error) {
      throw new Error(`Failed to import user preferences: ${error.message}`);
    }
  }

  // Helper functions
  static getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  static mergeDeep(target, source) {
    const output = { ...target };

    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.mergeDeep(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }

    return output;
  }

  static isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }
}

export default PreferenceService;
