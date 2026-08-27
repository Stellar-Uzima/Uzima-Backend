
import { Test, TestingModule } from '@nestjs/testing';
import { SigningService } from './signing.service';
import * as crypto from 'crypto';

describe('SigningService', () => {
  let service: SigningService;
  const secret = 'test-secret';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SigningService],
    }).compile();

    service = module.get<SigningService>(SigningService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateSignature', () => {
    it('should generate a valid HMAC-SHA256 signature', () => {
      const method = 'POST';
      const path = '/test';
      const body = JSON.stringify({ a: 1 });
      const timestamp = 1678886400; // 2023-03-15T12:00:00Z

      const signature = service.generateSignature(method, path, body, timestamp, secret);
      
      const expectedData = `${method}|${path}|${body}|${timestamp}`;
      const expectedSignature = crypto.createHmac('sha256', secret).update(expectedData).digest('hex');

      expect(signature).toBe(expectedSignature);
    });
  });

  describe('verifySignature', () => {
    const method = 'POST';
    const path = '/test';
    const body = { a: 1 };
    const timestamp = 1678886400;

    it('should return true for a valid signature', () => {
      const stringifiedBody = JSON.stringify(body);
      const signature = service.generateSignature(method, path, stringifiedBody, timestamp, secret);
      
      const isValid = service.verifySignature(signature, method, path, body, timestamp, secret);
      expect(isValid).toBe(true);
    });

    it('should return false for an invalid signature', () => {
      const invalidSignature = 'invalid-signature';
      const isValid = service.verifySignature(invalidSignature, method, path, body, timestamp, secret);
      expect(isValid).toBe(false);
    });

    it('should return false if any part of the payload changes', () => {
        const stringifiedBody = JSON.stringify(body);
        const signature = service.generateSignature(method, path, stringifiedBody, timestamp, secret);
        
        expect(service.verifySignature(signature, 'GET', path, body, timestamp, secret)).toBe(false);
        expect(service.verifySignature(signature, method, '/wrong-path', body, timestamp, secret)).toBe(false);
        expect(service.verifySignature(signature, method, path, { b: 2 }, timestamp, secret)).toBe(false);
        expect(service.verifySignature(signature, method, path, body, timestamp + 1, secret)).toBe(false);
        expect(service.verifySignature(signature, method, path, body, timestamp, 'wrong-secret')).toBe(false);
    });
  });

  describe('isTimestampValid', () => {
    it('should return true for a current timestamp', () => {
      const now = Math.floor(Date.now() / 1000);
      expect(service.isTimestampValid(now)).toBe(true);
    });

    it('should return false for an expired timestamp', () => {
      const expired = Math.floor(Date.now() / 1000) - 301; // 5 minutes and 1 second ago
      expect(service.isTimestampValid(expired)).toBe(false);
    });

    it('should return false for a future timestamp outside the window', () => {
      const future = Math.floor(Date.now() / 1000) + 301; // 5 minutes and 1 second in the future
      expect(service.isTimestampValid(future)).toBe(false);
    });
  });
});