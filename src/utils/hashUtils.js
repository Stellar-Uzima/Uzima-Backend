const crypto = require('crypto');

/**
 * @param {Object} data - Any object or string to hash.
 * @returns {string} 
 */
function sha256Hash(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

module.exports = { sha256Hash };
