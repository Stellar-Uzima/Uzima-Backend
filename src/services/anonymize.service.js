import { deterministicHash, randomSalt } from "../utils/hashUtils.js";

export class AnonymizationService {
  constructor() {
    this.auditLog = [];
  }

  anonymizeRecord(record, options = {}) {
    const { fieldsToAnonymize = [], reversible = false, salt = randomSalt() } = options;
    const anonymized = {};
    const mapping = {};

    Object.keys(record).forEach((key) => {
      if (fieldsToAnonymize.includes(key)) {
        const hashedValue = deterministicHash(record[key], salt);
        anonymized[key] = hashedValue;
        if (reversible) mapping[hashedValue] = record[key];
      } else {
        anonymized[key] = record[key];
      }
    });

    this.auditLog.push({ timestamp: new Date(), action: "anonymize", reversible });
    return { anonymized, mapping: reversible ? mapping : undefined };
  }
}

export default new AnonymizationService();
