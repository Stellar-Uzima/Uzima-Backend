/* eslint-disable prettier/prettier */
import axios from 'axios';

/**
 * Password complexity requirements constants
 */
const PASSWORD_REQUIREMENTS = {
  MIN_LENGTH: 8,
  MAX_LENGTH: 64,
  REQUIRE_UPPERCASE: true,
  REQUIRE_LOWERCASE: true,
  REQUIRE_NUMBER: true,
  REQUIRE_SPECIAL_CHAR: true,
};

/**
 * Special characters allowed in passwords
 */
const SPECIAL_CHARS_REGEX = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g;

/**
 * Validates password complexity requirements
 * @param {string} password - Password to validate
 * @returns {Object} - { valid: boolean, feedback: string[] }
 */
export const validatePasswordComplexity = (password) => {
  const feedback = [];

  if (!password) {
    feedback.push('Password is required');
    return { valid: false, feedback };
  }

  // Check minimum length
  if (password.length < PASSWORD_REQUIREMENTS.MIN_LENGTH) {
    feedback.push(`Password must be at least ${PASSWORD_REQUIREMENTS.MIN_LENGTH} characters long`);
  }

  // Check maximum length
  if (password.length > PASSWORD_REQUIREMENTS.MAX_LENGTH) {
    feedback.push(`Password must not exceed ${PASSWORD_REQUIREMENTS.MAX_LENGTH} characters`);
  }

  // Check uppercase
  if (PASSWORD_REQUIREMENTS.REQUIRE_UPPERCASE && !/[A-Z]/.test(password)) {
    feedback.push('Password must contain at least one uppercase letter');
  }

  // Check lowercase
  if (PASSWORD_REQUIREMENTS.REQUIRE_LOWERCASE && !/[a-z]/.test(password)) {
    feedback.push('Password must contain at least one lowercase letter');
  }

  // Check number
  if (PASSWORD_REQUIREMENTS.REQUIRE_NUMBER && !/[0-9]/.test(password)) {
    feedback.push('Password must contain at least one number');
  }

  // Check special character
  if (PASSWORD_REQUIREMENTS.REQUIRE_SPECIAL_CHAR && !SPECIAL_CHARS_REGEX.test(password)) {
    feedback.push('Password must contain at least one special character (!@#$%^&* etc)');
  }

  return { valid: feedback.length === 0, feedback };
};

/**
 * Check if password has been breached using haveibeenpwned API
 * Uses the k-anonymity model to protect privacy
 * @param {string} password - Password to check
 * @returns {Promise<{breached: boolean, count: number}>}
 */
export const checkPasswordBreach = async (password) => {
  try {
    if (!password) {
      return { breached: false, count: 0 };
    }

    // Use SHA-1 hash for haveibeenpwned API
    const sha1Hash = require('crypto').createHash('sha1').update(password).digest('hex').toUpperCase();
    
    // Send only first 5 chars for k-anonymity
    const prefix = sha1Hash.substring(0, 5);
    const suffix = sha1Hash.substring(5);

    // Query haveibeenpwned API with 5-char prefix
    const response = await axios.get(`https://api.pwnedpasswords.com/range/${prefix}`, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Uzima-Healthcare-System',
      },
    });

    // Parse response to check if our suffix is in the list
    const hashes = response.data.split('\r\n');
    for (const hash of hashes) {
      const [hashSuffix, count] = hash.split(':');
      if (hashSuffix === suffix) {
        return { breached: true, count: parseInt(count, 10) };
      }
    }

    return { breached: false, count: 0 };
  } catch (error) {
    // If API fails, we allow the password but log the error
    console.error('Error checking password breach:', error.message);
    return { breached: false, count: 0, error: error.message };
  }
};

/**
 * Calculate password strength score using zxcvbn algorithm
 * Emulates zxcvbn scoring (0-4) without external library dependency
 * @param {string} password - Password to score
 * @returns {Object} - { score: 0-4, feedback: string, suggestions: string[] }
 */
export const calculatePasswordStrength = (password) => {
  if (!password) {
    return { score: 0, feedback: 'No password provided', suggestions: ['Enter a password'] };
  }

  const suggestions = [];
  let score = 0;

  // Length scoring (25 points for each requirement met)
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;

  // Character variety scoring
  if (/[a-z]/.test(password)) score += 0.25;
  if (/[A-Z]/.test(password)) score += 0.25;
  if (/[0-9]/.test(password)) score += 0.25;
  if (SPECIAL_CHARS_REGEX.test(password)) score += 0.25;

  // Bonus for no common patterns
  if (!/(.)\1{2,}/.test(password)) score += 0.25; // No character repeats
  if (!/^[a-zA-Z]+$/.test(password)) score += 0.25; // Not just letters
  if (!/^[0-9]+$/.test(password)) score += 0.25; // Not just numbers

  // Cap score at 4
  score = Math.min(Math.floor(score), 4);

  // Generate feedback and suggestions
  const feedbackMap = {
    0: 'Very weak password',
    1: 'Weak password',
    2: 'Fair password',
    3: 'Strong password',
    4: 'Very strong password',
  };

  const suggestionsMap = {
    0: [
      'Password too short, use at least 8 characters',
      'Add uppercase, lowercase, numbers, and special characters',
    ],
    1: [
      'Consider using at least 12 characters',
      'Mix different character types',
    ],
    2: [
      'Consider using 16+ characters for better security',
      'Avoid common words and patterns',
    ],
    3: ['Well done! This is a strong password'],
    4: ['Excellent! This is a very strong password'],
  };

  return {
    score,
    feedback: feedbackMap[score],
    suggestions: suggestionsMap[score] || [],
  };
};

/**
 * Validate password is different from previous passwords
 * @param {string} password - New password to check
 * @param {Array} passwordHistory - Array of previous password hashes
 * @returns {Promise<boolean>}
 */
export const checkPasswordNotInHistory = async (password, passwordHistory = []) => {
  if (!passwordHistory || passwordHistory.length === 0) {
    return true;
  }

  const bcrypt = await import('bcrypt');
  
  for (const historyEntry of passwordHistory) {
    try {
      const isMatch = await bcrypt.default.compare(password, historyEntry.hash);
      if (isMatch) {
        return false; // Password found in history
      }
    } catch (error) {
      console.error('Error checking password history:', error.message);
    }
  }

  return true;
};

/**
 * Comprehensive password validation
 * @param {string} password - Password to validate
 * @param {Array} passwordHistory - Previous password hashes
 * @param {string} username - Username (to avoid using as password)
 * @param {string} email - Email (to avoid using as password)
 * @returns {Promise<{valid: boolean, feedback: string[], score: number}>}
 */
export const validatePassword = async (
  password,
  passwordHistory = [],
  username = '',
  email = ''
) => {
  const feedback = [];

  // Check complexity requirements
  const complexityCheck = validatePasswordComplexity(password);
  if (!complexityCheck.valid) {
    feedback.push(...complexityCheck.feedback);
  }

  // Check if password contains username or email
  if (username && password.toLowerCase().includes(username.toLowerCase())) {
    feedback.push('Password cannot contain your username');
  }

  if (email && password.toLowerCase().includes(email.toLowerCase())) {
    feedback.push('Password cannot contain your email');
  }

  // Check password history
  const notInHistory = await checkPasswordNotInHistory(password, passwordHistory);
  if (!notInHistory) {
    feedback.push('Password has been used before. Choose a different password');
  }

  // Check breach status
  const breachStatus = await checkPasswordBreach(password);
  if (breachStatus.breached) {
    feedback.push(
      `Password has been found in ${breachStatus.count} data breaches. Please choose a different password`
    );
  }

  // Calculate strength score
  const strength = calculatePasswordStrength(password);

  return {
    valid: feedback.length === 0,
    feedback,
    score: strength.score,
    scoreDetails: strength,
  };
};

export default {
  validatePasswordComplexity,
  checkPasswordBreach,
  calculatePasswordStrength,
  checkPasswordNotInHistory,
  validatePassword,
  PASSWORD_REQUIREMENTS,
};
