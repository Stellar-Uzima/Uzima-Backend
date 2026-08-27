import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { WebhookVerifierService } from './webhook-verifier.service';

describe('WebhookVerifierService (Issue #1057)', () => {
  let service: WebhookVerifierService;
  const SECRET = 'test_webhook_secret_key_123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookVerifierService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue: string) => {
              if (key === 'STELLAR_WEBHOOK_SECRET') return SECRET;
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<WebhookVerifierService>(WebhookVerifierService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verifySignature', () => {
    it('should successfully verify a valid HMAC-SHA256 signature', () => {
      const payload = Buffer.from(JSON.stringify({ event: 'payment.received', amount: '100.00' }));
      const validSignature = crypto
        .createHmac('sha256', SECRET)
        .update(payload)
        .digest('hex');

      expect(() => service.verifySignature(payload, validSignature)).not.toThrow();
    });

    it('should reject missing or empty signature header with UnauthorizedException', () => {
      const payload = Buffer.from('{"event":"test"}');

      expect(() => service.verifySignature(payload, '')).toThrow(UnauthorizedException);
      expect(() => service.verifySignature(payload, undefined as any)).toThrow(UnauthorizedException);
    });

    it('should reject invalid or tampered signature with UnauthorizedException', () => {
      const payload = Buffer.from('{"event":"test"}');
      const invalidSignature = crypto
        .createHmac('sha256', 'wrong_secret')
        .update(payload)
        .digest('hex');

      expect(() => service.verifySignature(payload, invalidSignature)).toThrow(UnauthorizedException);
    });

    it('should reject tampered payload even if signature matched original payload', () => {
      const originalPayload = Buffer.from('{"event":"original"}');
      const signature = crypto
        .createHmac('sha256', SECRET)
        .update(originalPayload)
        .digest('hex');

      const tamperedPayload = Buffer.from('{"event":"tampered"}');

      expect(() => service.verifySignature(tamperedPayload, signature)).toThrow(UnauthorizedException);
    });
  });
});
