/* eslint-disable prettier/prettier */
import bcrypt from 'bcrypt';

/**
 * Password policy configuration constants
 */
const PASSWORD_POLICY = {
  EXPIRY_DAYS: 90,
  HISTORY_COUNT: 5,
  FORCE_CHANGE_ON_RESET: true,
};

/**
 * Password Policy Service for managing password-related policies
 */
class PasswordPolicyService {
  /**
   * Add password to history
   * @param {Object} user - User document
   * @param {string} passwordHash - New password hash
   * @returns {Promise<void>}
   */
  static async addToPasswordHistory(user, passwordHash) {
    if (!user.security.passwordHistory) {
      user.security.passwordHistory = [];
    }

    // Add new password to history
    user.security.passwordHistory.push({
      hash: passwordHash,
      changedAt: new Date(),
    });

    // Keep only last 5 passwords
    if (user.security.passwordHistory.length > PASSWORD_POLICY.HISTORY_COUNT) {
      user.security.passwordHistory = user.security.passwordHistory.slice(
        -PASSWORD_POLICY.HISTORY_COUNT
      );
    }
  }

  /**
   * Set password expiry date
   * @param {Object} user - User document
   * @returns {void}
   */
  static setPasswordExpiry(user) {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + PASSWORD_POLICY.EXPIRY_DAYS);
    user.security.passwordExpiresAt = expiryDate;
  }

  /**
   * Check if password has expired
   * @param {Object} user - User document
   * @returns {boolean}
   */
  static isPasswordExpired(user) {
    if (!user.security.passwordExpiresAt) {
      return false;
    }
    return new Date() > user.security.passwordExpiresAt;
  }

  /**
   * Get days until password expires
   * @param {Object} user - User document
   * @returns {number} - Days remaining, negative if expired
   */
  static getDaysUntilExpiry(user) {
    if (!user.security.passwordExpiresAt) {
      return null;
    }

    const now = new Date();
    const expiry = new Date(user.security.passwordExpiresAt);
    const diffTime = expiry - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  }

  /**
   * Get password expiry warning level
   * @param {Object} user - User document
   * @returns {string} - 'danger' | 'warning' | 'info' | null
   */
  static getExpiryWarningLevel(user) {
    const daysRemaining = this.getDaysUntilExpiry(user);

    if (daysRemaining === null) return null;
    if (daysRemaining <= 0) return 'danger'; // Expired
    if (daysRemaining <= 7) return 'danger'; // Less than 7 days
    if (daysRemaining <= 14) return 'warning'; // Less than 14 days
    if (daysRemaining <= 30) return 'info'; // Less than 30 days

    return null;
  }

  /**
   * Mark user to require password change on next login
   * @param {Object} user - User document
   * @returns {void}
   */
  static forcePasswordChange(user) {
    user.security.requirePasswordChange = true;
  }

  /**
   * Clear force password change flag
   * @param {Object} user - User document
   * @returns {void}
   */
  static clearForcePasswordChange(user) {
    user.security.requirePasswordChange = false;
  }

  /**
   * Update password with all policy validations
   * @param {Object} user - User document
   * @param {string} newPasswordHash - Hashed new password
   * @returns {Promise<void>}
   */
  static async updatePassword(user, newPasswordHash) {
    // Add old password to history
    await this.addToPasswordHistory(user, user.password);

    // Set new password
    user.password = newPasswordHash;

    // Update timestamp
    user.security.passwordChangedAt = new Date();

    // Set expiry
    this.setPasswordExpiry(user);

    // Clear force change flag
    this.clearForcePasswordChange(user);

    // Reset login attempts on successful password change
    user.security.loginAttempts = 0;
    user.security.lockUntil = undefined;
  }

  /**
   * Lock account due to failed login attempts
   * @param {Object} user - User document
   * @param {number} maxAttempts - Max failed attempts allowed
   * @param {number} lockDurationMinutes - How long to lock account
   * @returns {boolean} - true if account should be locked
   */
  static handleFailedLoginAttempt(user, maxAttempts = 5, lockDurationMinutes = 15) {
    user.security.loginAttempts = (user.security.loginAttempts || 0) + 1;

    if (user.security.loginAttempts >= maxAttempts) {
      const lockUntil = new Date();
      lockUntil.setMinutes(lockUntil.getMinutes() + lockDurationMinutes);
      user.security.lockUntil = lockUntil;
      return true; // Account locked
    }

    return false;
  }

  /**
   * Reset failed login attempts
   * @param {Object} user - User document
   * @returns {void}
   */
  static resetFailedLoginAttempts(user) {
    user.security.loginAttempts = 0;
    user.security.lockUntil = undefined;
  }

  /**
   * Check if account is locked
   * @param {Object} user - User document
   * @returns {boolean}
   */
  static isAccountLocked(user) {
    if (!user.security.lockUntil) {
      return false;
    }
    return new Date() < user.security.lockUntil;
  }

  /**
   * Get account lock time remaining in minutes
   * @param {Object} user - User document
   * @returns {number} - Minutes remaining, 0 if not locked
   */
  static getLockTimeRemaining(user) {
    if (!this.isAccountLocked(user)) {
      return 0;
    }

    const now = new Date();
    const lockUntil = new Date(user.security.lockUntil);
    const diffTime = lockUntil - now;
    const diffMinutes = Math.ceil(diffTime / (1000 * 60));

    return Math.max(0, diffMinutes);
  }

  /**
   * Get comprehensive password status for user
   * @param {Object} user - User document
   * @returns {Object} - Password status details
   */
  static getPasswordStatus(user) {
    const daysUntilExpiry = this.getDaysUntilExpiry(user);
    const isExpired = this.isPasswordExpired(user);
    const isLocked = this.isAccountLocked(user);
    const lockTimeRemaining = this.getLockTimeRemaining(user);
    const expiryWarning = this.getExpiryWarningLevel(user);
    const requiresChange = user.security.requirePasswordChange || false;
    const historyCount = user.security.passwordHistory?.length || 0;

    return {
      isExpired,
      daysUntilExpiry,
      requiresChange,
      expiryWarning,
      isLocked,
      lockTimeRemaining,
      lastChanged: user.security.passwordChangedAt,
      expiresAt: user.security.passwordExpiresAt,
      historyCount,
      maxHistoryCount: PASSWORD_POLICY.HISTORY_COUNT,
    };
  }

  /**
   * Get password policy constants
   * @returns {Object}
   */
  static getPolicy() {
    return { ...PASSWORD_POLICY };
  }
}

export default PasswordPolicyService;
