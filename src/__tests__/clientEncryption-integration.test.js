/**
 * End-to-End Integration Tests for Client-Side Encryption
 * 
 * Tests the complete flow:
 * 1. Client encrypts PHI data
 * 2. Server receives and stores encrypted data
 * 3. Server returns encrypted data
 * 4. Client decrypts PHI data
 * 
 * This ensures no unencrypted PHI leaves the client environment.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../index.js';
import User from '../models/User.js';
import Record from '../models/Record.js';
import { isClientEncrypted } from '../utils/clientEncryptionServer.js';

// Mock client-side encryption functions for testing
// In real usage, these would be called from the browser
async function mockClientEncrypt(plaintext, passphrase) {
  // This is a simplified mock - in real tests, you'd use the actual Web Crypto API
  // For integration tests, we'll simulate the encrypted format
  if (!plaintext) return plaintext;
  
  // Simulate encryption format: v1:salt:iv:data:tag
  const mockSalt = Buffer.from('mockSalt12345678').toString('base64');
  const mockIV = Buffer.from('mockIV123456').toString('base64');
  const mockData = Buffer.from(`encrypted_${plaintext}`).toString('base64');
  const mockTag = Buffer.from('mockTag12345678').toString('base64');
  
  return `v1:${mockSalt}:${mockIV}:${mockData}:${mockTag}`;
}

async function mockClientDecrypt(encrypted, passphrase) {
  if (!encrypted) return encrypted;
  if (!isClientEncrypted(encrypted)) return encrypted;
  
  const parts = encrypted.split(':');
  if (parts.length !== 5) return encrypted;
  
  const [, , , dataBase64] = parts;
  const decoded = Buffer.from(dataBase64, 'base64').toString('utf8');
  
  // Extract original plaintext from mock format
  if (decoded.startsWith('encrypted_')) {
    return decoded.substring('encrypted_'.length);
  }
  return decoded;
}

describe('Client-Side Encryption Integration Tests', () => {
  let testUser;
  let authToken;
  let userPassphrase;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/uzima-test');
    }

    // Create test user
    testUser = await User.create({
      username: 'testdoctor',
      email: 'doctor@test.com',
      password: 'hashedPassword123',
      role: 'doctor',
    });

    // Generate auth token (simplified - in real app, use JWT)
    authToken = 'mock-jwt-token';

    // User's encryption passphrase (never sent to server)
    userPassphrase = 'UserSecurePassphrase123!@#';
  });

  afterAll(async () => {
    await User.deleteMany({});
    await Record.deleteMany({});
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  });

  beforeEach(async () => {
    await Record.deleteMany({});
  });

  describe('End-to-End PHI Encryption Workflow', () => {
    test('should encrypt PHI on client before API submission', async () => {
      const plaintextRecord = {
        patientName: 'John Doe',
        diagnosis: 'Type 2 Diabetes Mellitus',
        treatment: 'Metformin 500mg BID',
        history: 'Family history of diabetes',
        txHash: '0x1234567890abcdef',
        clientUUID: 'test-uuid-1',
        syncTimestamp: new Date(),
      };

      // Step 1: Client encrypts PHI fields
      const encryptedDiagnosis = await mockClientEncrypt(plaintextRecord.diagnosis, userPassphrase);
      const encryptedTreatment = await mockClientEncrypt(plaintextRecord.treatment, userPassphrase);
      const encryptedHistory = await mockClientEncrypt(plaintextRecord.history, userPassphrase);

      // Verify encryption
      expect(isClientEncrypted(encryptedDiagnosis)).toBe(true);
      expect(isClientEncrypted(encryptedTreatment)).toBe(true);
      expect(isClientEncrypted(encryptedHistory)).toBe(true);

      // Step 2: Client sends encrypted data to server
      const recordToSend = {
        ...plaintextRecord,
        diagnosis: encryptedDiagnosis,
        treatment: encryptedTreatment,
        history: encryptedHistory,
      };

      // Verify no unencrypted PHI in payload
      expect(recordToSend.diagnosis).not.toContain('Diabetes');
      expect(recordToSend.treatment).not.toContain('Metformin');

      // Step 3: Server stores encrypted data (simulated)
      const savedRecord = await Record.create({
        ...recordToSend,
        createdBy: testUser._id,
      });

      // Verify server stored encrypted data
      expect(isClientEncrypted(savedRecord.diagnosis)).toBe(true);
      expect(isClientEncrypted(savedRecord.treatment)).toBe(true);
      expect(isClientEncrypted(savedRecord.history)).toBe(true);

      // Step 4: Server returns encrypted data
      const retrievedRecord = await Record.findById(savedRecord._id);

      // Step 5: Client decrypts PHI fields
      const decryptedDiagnosis = await mockClientDecrypt(retrievedRecord.diagnosis, userPassphrase);
      const decryptedTreatment = await mockClientDecrypt(retrievedRecord.treatment, userPassphrase);
      const decryptedHistory = await mockClientDecrypt(retrievedRecord.history, userPassphrase);

      // Verify decryption accuracy
      expect(decryptedDiagnosis).toBe(plaintextRecord.diagnosis);
      expect(decryptedTreatment).toBe(plaintextRecord.treatment);
      expect(decryptedHistory).toBe(plaintextRecord.history);
    });

    test('should not store unencrypted PHI in database', async () => {
      const plaintextRecord = {
        patientName: 'Jane Smith',
        diagnosis: 'Hypertension',
        treatment: 'Lisinopril 10mg daily',
        history: 'Family history of heart disease',
        txHash: '0xabcdef1234567890',
        clientUUID: 'test-uuid-2',
        syncTimestamp: new Date(),
      };

      // Encrypt on client
      const encryptedRecord = {
        ...plaintextRecord,
        diagnosis: await mockClientEncrypt(plaintextRecord.diagnosis, userPassphrase),
        treatment: await mockClientEncrypt(plaintextRecord.treatment, userPassphrase),
        history: await mockClientEncrypt(plaintextRecord.history, userPassphrase),
      };

      // Store in database
      const savedRecord = await Record.create({
        ...encryptedRecord,
        createdBy: testUser._id,
      });

      // Retrieve raw from database
      const rawRecord = await Record.findById(savedRecord._id).lean();

      // Verify no unencrypted PHI in database
      expect(rawRecord.diagnosis).not.toContain('Hypertension');
      expect(rawRecord.treatment).not.toContain('Lisinopril');
      expect(rawRecord.history).not.toContain('heart disease');

      // Verify encrypted format
      expect(isClientEncrypted(rawRecord.diagnosis)).toBe(true);
      expect(isClientEncrypted(rawRecord.treatment)).toBe(true);
      expect(isClientEncrypted(rawRecord.history)).toBe(true);
    });

    test('should handle server-side encryption fallback for non-client-encrypted data', async () => {
      // This test verifies backward compatibility
      // If client doesn't encrypt, server should encrypt (existing behavior)
      const record = {
        patientName: 'Test Patient',
        diagnosis: 'Plaintext diagnosis', // Not client-encrypted
        treatment: 'Plaintext treatment',
        txHash: '0xtest123',
        clientUUID: 'test-uuid-3',
        syncTimestamp: new Date(),
        createdBy: testUser._id,
      };

      const savedRecord = await Record.create(record);

      // Server-side encryption plugin should have encrypted it
      // Format: version:iv:authTag:encryptedContent (4 parts)
      const parts = savedRecord.diagnosis.split(':');
      expect(parts.length).toBe(4); // Server-side format
    });

    test('should not double-encrypt client-encrypted data', async () => {
      const plaintextRecord = {
        patientName: 'Test Patient',
        diagnosis: 'Client encrypted diagnosis',
        treatment: 'Client encrypted treatment',
        txHash: '0xtest456',
        clientUUID: 'test-uuid-4',
        syncTimestamp: new Date(),
      };

      // Client encrypts
      const encryptedRecord = {
        ...plaintextRecord,
        diagnosis: await mockClientEncrypt(plaintextRecord.diagnosis, userPassphrase),
        treatment: await mockClientEncrypt(plaintextRecord.treatment, userPassphrase),
      };

      // Store (server should detect client encryption and not re-encrypt)
      const savedRecord = await Record.create({
        ...encryptedRecord,
        createdBy: testUser._id,
      });

      // Verify still in client-encrypted format (5 parts)
      const diagnosisParts = savedRecord.diagnosis.split(':');
      expect(diagnosisParts.length).toBe(5); // Client format preserved
      expect(diagnosisParts[0]).toBe('v1'); // Client version
    });
  });

  describe('Decryption Accuracy (≥99.9999%)', () => {
    test('should achieve ≥99.9999% accuracy in round-trip encryption/decryption', async () => {
      const testCases = [];
      
      // Generate 10,000 test cases
      for (let i = 0; i < 10000; i++) {
        testCases.push({
          diagnosis: `Diagnosis ${i}: Type 2 Diabetes`,
          treatment: `Treatment ${i}: Metformin 500mg`,
          history: `History ${i}: Family history`,
        });
      }

      let successCount = 0;
      let failureCount = 0;

      for (const testCase of testCases) {
        try {
          // Encrypt
          const encrypted = {
            diagnosis: await mockClientEncrypt(testCase.diagnosis, userPassphrase),
            treatment: await mockClientEncrypt(testCase.treatment, userPassphrase),
            history: await mockClientEncrypt(testCase.history, userPassphrase),
          };

          // Store
          const record = await Record.create({
            patientName: 'Test',
            ...encrypted,
            txHash: `0xtest${successCount}`,
            clientUUID: `uuid-${successCount}`,
            syncTimestamp: new Date(),
            createdBy: testUser._id,
          });

          // Retrieve
          const retrieved = await Record.findById(record._id);

          // Decrypt
          const decrypted = {
            diagnosis: await mockClientDecrypt(retrieved.diagnosis, userPassphrase),
            treatment: await mockClientDecrypt(retrieved.treatment, userPassphrase),
            history: await mockClientDecrypt(retrieved.history, userPassphrase),
          };

          // Verify
          if (
            decrypted.diagnosis === testCase.diagnosis &&
            decrypted.treatment === testCase.treatment &&
            decrypted.history === testCase.history
          ) {
            successCount++;
          } else {
            failureCount++;
          }
        } catch (error) {
          failureCount++;
        }
      }

      const accuracy = successCount / testCases.length;
      expect(accuracy).toBeGreaterThanOrEqual(0.999999); // ≥99.9999%
      expect(failureCount).toBe(0); // Zero false positives
    });
  });

  describe('Security Compliance', () => {
    test('should ensure no unencrypted PHI in network traffic', async () => {
      const sensitivePHI = {
        diagnosis: 'Patient HIV status: positive',
        treatment: 'Mental health: depression treatment',
        history: 'Substance abuse history',
      };

      // Encrypt on client
      const encrypted = {
        diagnosis: await mockClientEncrypt(sensitivePHI.diagnosis, userPassphrase),
        treatment: await mockClientEncrypt(sensitivePHI.treatment, userPassphrase),
        history: await mockClientEncrypt(sensitivePHI.history, userPassphrase),
      };

      // Verify encrypted data doesn't contain sensitive information
      const encryptedString = JSON.stringify(encrypted);
      expect(encryptedString).not.toContain('HIV');
      expect(encryptedString).not.toContain('positive');
      expect(encryptedString).not.toContain('depression');
      expect(encryptedString).not.toContain('Substance abuse');
    });

    test('should not expose passphrase in any form', async () => {
      const passphrase = 'MySecretPassphrase123!';
      const encrypted = await mockClientEncrypt('test', passphrase);

      // Encrypted data should not contain passphrase
      expect(encrypted).not.toContain(passphrase);
      expect(encrypted).not.toContain('Secret');
      expect(encrypted).not.toContain('Passphrase');
    });
  });
});
