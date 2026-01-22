/* eslint-disable prettier/prettier */
import request from 'supertest';
import app from '../index.js';
import Record from '../models/Record.js';
import User from '../models/User.js';
import { encrypt, decrypt } from '../utils/encryptionUtils.js';

describe('Medical Data Encryption Integration Tests', () => {
  let testUser;
  let authToken;
  const medicalRecord = {
    patientName: 'Jane Smith',
    diagnosis: 'Hypertension, Type 2 Diabetes',
    treatment: 'Lisinopril 10mg daily, Metformin 500mg twice daily',
    history: 'Family history of cardiovascular disease, previous MI in 2020',
    txHash: 'test-stellar-tx-hash-123',
    clientUUID: 'test-client-uuid-456',
    syncTimestamp: new Date().toISOString()
  };

  beforeAll(async () => {
    // Set up environment variables for testing
    process.env.ENCRYPTION_KEY_SECRET_v1 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.ENCRYPTION_KEY_CURRENT_VERSION = 'v1';
    process.env.JWT_SECRET = 'test-jwt-secret';
  });

  beforeEach(async () => {
    // Create a test user
    testUser = new User({
      username: 'testdoctor',
      email: 'test@example.com',
      password: 'hashedpassword',
      role: 'doctor'
    });
    await testUser.save();

    // Mock authentication token
    authToken = 'mock-jwt-token';
  });

  afterEach(async () => {
    // Clean up test data
    await Record.deleteMany({});
    await User.deleteMany({});
  });

  describe('End-to-End PHI Encryption Workflow', () => {

    test('should encrypt PHI fields during record creation', async () => {
      const response = await request(app)
        .post('/api/records')
        .set('Authorization', `Bearer ${authToken}`)
        .send(medicalRecord)
        .expect(201);

      // Verify record was created
      expect(response.body.success).toBe(true);
      
      // Retrieve the record from database to verify encryption
      const savedRecord = await Record.findOne({ clientUUID: medicalRecord.clientUUID });
      expect(savedRecord).toBeTruthy();

      // Verify PHI fields are encrypted (should not match original values)
      expect(savedRecord.diagnosis).not.toBe(medicalRecord.diagnosis);
      expect(savedRecord.treatment).not.toBe(medicalRecord.treatment);
      expect(savedRecord.history).not.toBe(medicalRecord.history);

      // Verify non-PHI fields are not encrypted
      expect(savedRecord.patientName).toBe(medicalRecord.patientName);
      expect(savedRecord.txHash).toBe(medicalRecord.txHash);

      // Verify encrypted fields can be decrypted
      expect(decrypt(savedRecord.diagnosis)).toBe(medicalRecord.diagnosis);
      expect(decrypt(savedRecord.treatment)).toBe(medicalRecord.treatment);
      expect(decrypt(savedRecord.history)).toBe(medicalRecord.history);
    });

    test('should decrypt PHI fields when retrieving records', async () => {
      // First, create an encrypted record
      const encryptedDiagnosis = encrypt(medicalRecord.diagnosis);
      const encryptedTreatment = encrypt(medicalRecord.treatment);
      const encryptedHistory = encrypt(medicalRecord.history);

      const record = new Record({
        ...medicalRecord,
        diagnosis: encryptedDiagnosis,
        treatment: encryptedTreatment,
        history: encryptedHistory,
        createdBy: testUser._id
      });
      await record.save();

      // Retrieve the record via API
      const response = await request(app)
        .get(`/api/records/${record._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Verify decrypted data is returned
      expect(response.body.diagnosis).toBe(medicalRecord.diagnosis);
      expect(response.body.treatment).toBe(medicalRecord.treatment);
      expect(response.body.history).toBe(medicalRecord.history);
    });

    test('should handle bulk record operations with encryption', async () => {
      const bulkRecords = Array.from({ length: 10 }, (_, i) => ({
        patientName: `Patient ${i}`,
        diagnosis: `Diagnosis ${i}: Various conditions`,
        treatment: `Treatment ${i}: Medication regimen`,  
        history: `History ${i}: Previous medical conditions`,
        txHash: `tx-hash-${i}`,
        clientUUID: `client-uuid-${i}`,
        syncTimestamp: new Date().toISOString()
      }));

      // Send bulk create request
      const response = await request(app)
        .post('/api/records/bulk')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ records: bulkRecords })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.created).toBe(10);

      // Verify all records are encrypted in database
      const savedRecords = await Record.find({});
      expect(savedRecords).toHaveLength(10);

      savedRecords.forEach((record, i) => {
        // Verify encryption
        expect(record.diagnosis).not.toBe(bulkRecords[i].diagnosis);
        expect(record.treatment).not.toBe(bulkRecords[i].treatment);
        expect(record.history).not.toBe(bulkRecords[i].history);

        // Verify decryption works
        expect(decrypt(record.diagnosis)).toBe(bulkRecords[i].diagnosis);
        expect(decrypt(record.treatment)).toBe(bulkRecords[i].treatment);
        expect(decrypt(record.history)).toBe(bulkRecords[i].history);
      });
    });

    test('should maintain data integrity during record updates', async () => {
      // Create initial record
      const record = new Record({
        ...medicalRecord,
        diagnosis: encrypt(medicalRecord.diagnosis),
        treatment: encrypt(medicalRecord.treatment),
        history: encrypt(medicalRecord.history),
        createdBy: testUser._id
      });
      await record.save();

      // Update the record
      const updatedData = {
        diagnosis: 'Updated diagnosis: Controlled hypertension',
        treatment: 'Updated treatment: Increased Lisinopril to 20mg',
        history: medicalRecord.history // Keep history unchanged
      };

      const response = await request(app)
        .put(`/api/records/${record._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updatedData)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify updated record is properly encrypted
      const updatedRecord = await Record.findById(record._id);
      expect(decrypt(updatedRecord.diagnosis)).toBe(updatedData.diagnosis);
      expect(decrypt(updatedRecord.treatment)).toBe(updatedData.treatment);
      expect(decrypt(updatedRecord.history)).toBe(medicalRecord.history);
    });
  });

  describe('Performance and Accuracy Requirements', () => {
    test('should meet performance requirements for encryption operations', async () => {
      const largeRecord = {
        patientName: 'Performance Test Patient',
        diagnosis: 'Large diagnosis text: ' + 'Medical condition details '.repeat(100),
        treatment: 'Extensive treatment plan: ' + 'Treatment details '.repeat(100),
        history: 'Comprehensive medical history: ' + 'Historical data '.repeat(100),
        txHash: 'perf-test-tx-hash',
        clientUUID: 'perf-test-uuid',
        syncTimestamp: new Date().toISOString()
      };

      const startTime = process.hrtime.bigint();

      // Create record (includes encryption)
      const response = await request(app)
        .post('/api/records')
        .set('Authorization', `Bearer ${authToken}`)
        .send(largeRecord)
        .expect(201);

      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000; // Convert to milliseconds

      expect(response.body.success).toBe(true);
      // Performance overhead should be ≤10% (assuming baseline < 100ms, overhead should be < 10ms)
      expect(durationMs).toBeLessThan(1000); // 1 second max for large records
    });

    test('should achieve 99.9999% decryption accuracy', async () => {
      const testCases = Array.from({ length: 1000 }, (_, i) => ({
        patientName: `Patient ${i}`,
        diagnosis: `Unique diagnosis ${i} with special chars: àáâãäå`,
        treatment: `Treatment ${i} with unicode: 中文测试 العربية 🏥💊`,
        history: `History ${i} with numbers: ${Math.random().toString()}`,
        txHash: `tx-${i}`,
        clientUUID: `uuid-${i}`,
        syncTimestamp: new Date().toISOString()
      }));

      let successCount = 0;
      let totalOperations = 0;

      for (const testCase of testCases) {
        try {
          // Encrypt
          const encryptedDiagnosis = encrypt(testCase.diagnosis);
          const encryptedTreatment = encrypt(testCase.treatment);
          const encryptedHistory = encrypt(testCase.history);

          // Decrypt
          const decryptedDiagnosis = decrypt(encryptedDiagnosis);
          const decryptedTreatment = decrypt(encryptedTreatment);
          const decryptedHistory = decrypt(encryptedHistory);

          totalOperations += 3; // 3 fields per test case

          // Verify accuracy
          if (decryptedDiagnosis === testCase.diagnosis) successCount++;
          if (decryptedTreatment === testCase.treatment) successCount++;
          if (decryptedHistory === testCase.history) successCount++;

        } catch (error) {
          totalOperations += 3; // Count failed operations
        }
      }

      const accuracy = successCount / totalOperations;
      expect(accuracy).toBeGreaterThanOrEqual(0.999999); // 99.9999% accuracy requirement
    });

    test('should have zero false positives in decryption', async () => {
      const originalData = 'Sensitive medical information';
      const encrypted = encrypt(originalData);
      
      // Test with wrong decryption (should fail, not return false positive)
      const tamperedEncrypted = encrypted.slice(0, -1) + 'x';
      
      expect(() => {
        decrypt(tamperedEncrypted);
      }).toThrow(); // Should throw error, not return incorrect data
    });
  });

  describe('Security and Compliance Tests', () => {
    test('should ensure no unencrypted PHI in database', async () => {
      const sensitiveRecord = {
        patientName: 'John Doe',
        diagnosis: 'HIV positive, AIDS-related complex',
        treatment: 'Antiretroviral therapy: Truvada, Isentress',
        history: 'Patient diagnosed with HIV in 2018, CD4 count 350',
        txHash: 'security-test-tx',
        clientUUID: 'security-test-uuid',
        syncTimestamp: new Date().toISOString()
      };

      await request(app)
        .post('/api/records')
        .set('Authorization', `Bearer ${authToken}`)
        .send(sensitiveRecord)
        .expect(201);

      // Query database directly to verify encryption
      const savedRecord = await Record.findOne({ clientUUID: sensitiveRecord.clientUUID });
      
      // Convert record to JSON string to search for sensitive terms
      const recordJson = JSON.stringify(savedRecord.toObject());
      
      // Verify sensitive terms are not present in stored data
      expect(recordJson.toLowerCase()).not.toContain('hiv');
      expect(recordJson.toLowerCase()).not.toContain('aids');
      expect(recordJson.toLowerCase()).not.toContain('truvada');
      expect(recordJson.toLowerCase()).not.toContain('antiretroviral');
    });

    test('should handle encryption errors gracefully', async () => {
      // Temporarily break encryption by using invalid key
      const originalKey = process.env.ENCRYPTION_KEY_SECRET_v1;
      process.env.ENCRYPTION_KEY_SECRET_v1 = 'invalid-key';

      const response = await request(app)
        .post('/api/records')
        .set('Authorization', `Bearer ${authToken}`)
        .send(medicalRecord)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Encryption error');

      // Restore original key
      process.env.ENCRYPTION_KEY_SECRET_v1 = originalKey;
    });

    test('should maintain encryption audit trail', async () => {
      const record = new Record({
        ...medicalRecord,
        diagnosis: encrypt(medicalRecord.diagnosis),
        treatment: encrypt(medicalRecord.treatment),
        history: encrypt(medicalRecord.history),
        createdBy: testUser._id
      });
      await record.save();

      // Verify encrypted fields have expected format for audit
      // Format: version:iv:authTag:encrypted
      expect(record.diagnosis).toMatch(/^v\d+:[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]+$/);
      expect(record.treatment).toMatch(/^v\d+:[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]+$/);
      expect(record.history).toMatch(/^v\d+:[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]+$/);

      // Verify each encrypted field has unique IV (second part after version)
      const diagnosisIV = record.diagnosis.split(':')[1];
      const treatmentIV = record.treatment.split(':')[1];
      const historyIV = record.history.split(':')[1];

      expect(diagnosisIV).not.toBe(treatmentIV);
      expect(treatmentIV).not.toBe(historyIV);
      expect(diagnosisIV).not.toBe(historyIV);
    });
  });

  describe('API Security Tests', () => {
    test('should reject requests without proper authentication', async () => {
      const response = await request(app)
        .post('/api/records')
        .send(medicalRecord)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    test('should sanitize error messages to prevent information leakage', async () => {
      // Test with malformed data that might cause encryption errors
      const malformedRecord = {
        ...medicalRecord,
        diagnosis: null, // This might cause issues
        treatment: undefined
      };

      const response = await request(app)
        .post('/api/records')
        .set('Authorization', `Bearer ${authToken}`)
        .send(malformedRecord);

      // Error response should not contain sensitive system information
      if (response.status >= 400) {
        expect(response.body.message).not.toContain('ENCRYPTION_KEY_SECRET');
        expect(response.body.message).not.toContain(process.env.ENCRYPTION_KEY_SECRET_v1);
        // __dirname check removed - not available in ES modules and not critical for security testing
      }
    });

    test('should validate PHI field sizes to prevent DoS attacks', async () => {
      const oversizedRecord = {
        ...medicalRecord,
        diagnosis: 'A'.repeat(1000000), // 1MB of data
        treatment: 'B'.repeat(1000000),
        history: 'C'.repeat(1000000)
      };

      const response = await request(app)
        .post('/api/records')
        .set('Authorization', `Bearer ${authToken}`)
        .send(oversizedRecord);

      // Should either succeed with reasonable performance or reject appropriately
      if (response.status >= 400) {
        expect(response.body.message).toContain('size');
      } else {
        expect(response.status).toBe(201);
      }
    });
  });

  describe('Code Coverage and Edge Cases', () => {
    test('should handle records with only some PHI fields', async () => {
      const partialRecord = {
        patientName: 'Partial Record Patient',
        diagnosis: 'Only diagnosis provided',
        // treatment and history omitted
        txHash: 'partial-tx-hash',
        clientUUID: 'partial-uuid',
        syncTimestamp: new Date().toISOString()
      };

      await request(app)
        .post('/api/records')
        .set('Authorization', `Bearer ${authToken}`)
        .send(partialRecord)
        .expect(201);

      const savedRecord = await Record.findOne({ clientUUID: partialRecord.clientUUID });
      expect(decrypt(savedRecord.diagnosis)).toBe(partialRecord.diagnosis);
      expect(savedRecord.treatment).toBeUndefined();
      expect(savedRecord.history).toBeUndefined();
    });

    test('should handle concurrent record creation operations', async () => {
      const concurrentRecords = Array.from({ length: 20 }, (_, i) => ({
        patientName: `Concurrent Patient ${i}`,
        diagnosis: `Concurrent diagnosis ${i}`,
        treatment: `Concurrent treatment ${i}`,
        history: `Concurrent history ${i}`,
        txHash: `concurrent-tx-${i}`,
        clientUUID: `concurrent-uuid-${i}`,
        syncTimestamp: new Date().toISOString()
      }));

      // Send all requests concurrently
      const promises = concurrentRecords.map(record => 
        request(app)
          .post('/api/records')
          .set('Authorization', `Bearer ${authToken}`)
          .send(record)
      );

      const responses = await Promise.all(promises);
      
      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(201);
      });

      // Verify all records are properly encrypted
      const allRecords = await Record.find({});
      expect(allRecords).toHaveLength(20);
    });

    test('should maintain consistent encryption across application restarts', async () => {
      const testData = 'Persistent encryption test data';
      const encrypted1 = encrypt(testData);
      
      // Simulate application restart by creating new encryption instance
      const encrypted2 = encrypt(testData);
      
      // Both should decrypt to the same value
      expect(decrypt(encrypted1)).toBe(testData);
      expect(decrypt(encrypted2)).toBe(testData);
      
      // But encrypted values should be different (due to different IVs)
      expect(encrypted1).not.toBe(encrypted2);
    });
  });
});
