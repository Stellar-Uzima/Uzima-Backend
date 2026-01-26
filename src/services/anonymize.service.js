import { deterministicHash, randomSalt, redact } from "../utils/hashUtils.js";
import ActivityLog from "../models/ActivityLog.js";

export class AnonymizationService {
  /**
   * Anonymize a record based on provided options.
   * @param {Object} record - The data object to anonymize.
   * @param {Object} options - Configuration options.
   * @param {string[]} [options.fieldsToAnonymize] - Fields to hash.
   * @param {string[]} [options.fieldsToRedact] - Fields to redact (mask).
   * @param {boolean} [options.reversible] - Whether to create a mapping for pseudonymization.
   * @param {string} [options.salt] - Salt for hashing. Defaults to random salt.
   * @param {string} [options.userId] - ID of the user performing the action (for audit).
   * @returns {Promise<{anonymized: Object, mapping: Object|undefined}>}
   */
  async anonymizeRecord(record, options = {}) {
    const {
      fieldsToAnonymize = [],
      fieldsToRedact = [],
      reversible = false,
      salt = randomSalt(),
      userId
    } = options;

    const anonymized = {};
    const mapping = {};

    Object.keys(record).forEach((key) => {
      if (fieldsToAnonymize.includes(key)) {
        const hashedValue = deterministicHash(record[key], salt);
        anonymized[key] = hashedValue;
        if (reversible) mapping[hashedValue] = record[key];
      } else if (fieldsToRedact.includes(key)) {
        anonymized[key] = redact(String(record[key]));
      } else {
        anonymized[key] = record[key];
      }
    });

    // Audit Log
    if (userId) {
      await ActivityLog.logActivity({
        userId,
        action: 'gdpr_data_export', // Using closest existing action
        result: 'success',
        metadata: {
          reversible,
          fieldsAnonymized: fieldsToAnonymize,
          fieldsRedacted: fieldsToRedact
        }
      });
    }

    return { anonymized, mapping: reversible ? mapping : undefined };
  }
}

export default new AnonymizationService();
