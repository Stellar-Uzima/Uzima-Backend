import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import Redis from 'ioredis';
import { OtpService } from './otp.service';

describe('OtpService', () => {
  let service: OtpService;
  let mockRedis: jest.Mocked<Redis>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockEventEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    // Mock Redis
    mockRedis = {
      exists: jest.fn(),
      ttl: jest.fn(),
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      incr: jest.fn(),
      incrby: jest.fn(),
      expire: jest.fn(),
      pipeline: jest.fn(),
    } as any;

    mockConfigService = {
      get: jest.fn(),
    } as any;

    mockEventEmitter = {
      emit: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<OtpService>(OtpService);
    // Override the redis instance
    (service as any).redis = mockRedis;
  });

  describe('requestOtp', () => {
    const phoneNumber = '+1234567890';

    it('should return success when OTP is requested for the first time', async () => {
      mockRedis.exists.mockResolvedValue(0); // not locked
      mockRedis.ttl.mockResolvedValue(-2); // no cooldown
      mockRedis.get.mockResolvedValue(null); // no request count

      const mockPipeline = {
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        setex: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 1], [null, 1], [null, 'OK']]),
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline as any);

      const result = await service.requestOtp(phoneNumber);

      expect(result.success).toBe(true);
      expect(result.message).toBe('OTP sent successfully');
      expect(result.remainingAttempts).toBe(2);
      expect(result.retryAfter).toBeUndefined();
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'otp.requested',
        expect.objectContaining({
          phoneNumber: expect.any(String),
          otp: expect.any(String),
          remainingAttempts: 2,
        }),
      );
    });

    it('should return 429 (TOO_MANY_REQUESTS) error when resend cooldown is active', async () => {
      const cooldownTtl = 45; // 45 seconds remaining

      mockRedis.exists.mockResolvedValue(0); // not locked
      mockRedis.ttl
        .mockResolvedValueOnce(cooldownTtl) // cooldown is active
        .mockResolvedValueOnce(-2); // rate limit not active

      const result = await service.requestOtp(phoneNumber);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Please wait before requesting a new OTP');
      expect(result.retryAfter).toBe(cooldownTtl);
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should set resend cooldown after generating OTP', async () => {
      mockRedis.exists.mockResolvedValue(0); // not locked
      mockRedis.ttl.mockResolvedValue(-2); // no cooldown
      mockRedis.get.mockResolvedValue(null); // no request count

      const mockPipeline = {
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        setex: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 1], [null, 1], [null, 'OK']]),
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline as any);

      await service.requestOtp(phoneNumber);

      // Verify that the cooldown was set
      expect(mockPipeline.setex).toHaveBeenCalledWith(
        expect.stringContaining('otp_resend_cooldown:'),
        60, // 60 seconds
        'cooldown',
      );
    });

    it('should return error when phone is locked due to failed attempts', async () => {
      const lockoutTtl = 1200; // 20 minutes

      mockRedis.exists.mockResolvedValue(1); // phone is locked
      mockRedis.ttl.mockResolvedValue(lockoutTtl);

      const result = await service.requestOtp(phoneNumber);

      expect(result.success).toBe(false);
      expect(result.message).toContain('temporarily locked');
      expect(result.lockoutMinutes).toBe(Math.ceil(lockoutTtl / 60));
    });

    it('should return error when max requests per hour is exceeded', async () => {
      const rateLimitTtl = 1800; // 30 minutes

      mockRedis.exists.mockResolvedValue(0); // not locked
      mockRedis.ttl.mockResolvedValue(-2); // no cooldown
      mockRedis.get.mockResolvedValue('3'); // 3 requests already made

      const result = await service.requestOtp(phoneNumber);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Maximum OTP requests exceeded');
      expect(result.remainingAttempts).toBe(0);
    });

    it('should increment request count after successful OTP generation', async () => {
      mockRedis.exists.mockResolvedValue(0); // not locked
      mockRedis.ttl.mockResolvedValue(-2); // no cooldown
      mockRedis.get.mockResolvedValue('1'); // 1 request already made

      const mockPipeline = {
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        setex: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 2], [null, 1], [null, 'OK']]),
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline as any);

      const result = await service.requestOtp(phoneNumber);

      expect(result.success).toBe(true);
      expect(result.remainingAttempts).toBe(1);
      expect(mockPipeline.incr).toHaveBeenCalled();
      expect(mockPipeline.expire).toHaveBeenCalled();
    });

    it('should normalize phone number before processing', async () => {
      const phoneWithFormatting = '+1 (234) 567-890';
      const normalizedPhone = '1234567890';

      mockRedis.exists.mockResolvedValue(0); // not locked
      mockRedis.ttl.mockResolvedValue(-2); // no cooldown
      mockRedis.get.mockResolvedValue(null); // no request count

      const mockPipeline = {
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        setex: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 1], [null, 1], [null, 'OK']]),
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline as any);

      await service.requestOtp(phoneWithFormatting);

      // Verify that pipeline.setex was called with normalized phone number
      expect(mockPipeline.setex).toHaveBeenCalledWith(
        expect.stringContaining(normalizedPhone),
        60,
        'cooldown',
      );
    });
  });

  describe('verifyOtp', () => {
    const phoneNumber = '+1234567890';
    const otp = '123456';

    it('should verify correct OTP', async () => {
      mockRedis.exists.mockResolvedValue(0); // not locked
      mockRedis.get.mockResolvedValue(otp); // stored OTP matches

      const mockPipeline = {
        del: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 1], [null, 1], [null, 1]]),
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline as any);

      const result = await service.verifyOtp(phoneNumber, otp);

      expect(result.success).toBe(true);
      expect(result.message).toBe('OTP verified successfully');
    });

    it('should reject incorrect OTP', async () => {
      mockRedis.exists.mockResolvedValue(0); // not locked
      mockRedis.get.mockResolvedValue(otp); // stored OTP

      const mockPipeline = {
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 1], [null, 1]]),
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline as any);

      const result = await service.verifyOtp(phoneNumber, '654321'); // wrong OTP

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid OTP');
    });

    it('should lock phone after 3 failed attempts', async () => {
      mockRedis.exists.mockResolvedValue(0); // not locked
      mockRedis.get.mockResolvedValue(otp); // stored OTP

      const mockPipeline = {
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 3], [null, 1]]), // 3 failed attempts
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline as any);
      mockRedis.setex.mockResolvedValue('OK');
      mockRedis.del.mockResolvedValue(1);

      const result = await service.verifyOtp(phoneNumber, '654321'); // wrong OTP

      expect(result.success).toBe(false);
      expect(result.message).toContain('Too many failed attempts');
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.stringContaining('otp_lock:'),
        1800, // 30 minutes lockout
        'locked',
      );
    });

    it('should reject OTP when phone is locked', async () => {
      const lockoutTtl = 1200;

      mockRedis.exists.mockResolvedValue(1); // phone is locked
      mockRedis.ttl.mockResolvedValue(lockoutTtl);

      const result = await service.verifyOtp(phoneNumber, otp);

      expect(result.success).toBe(false);
      expect(result.message).toContain('locked');
    });

    it('should reject expired OTP', async () => {
      mockRedis.exists.mockResolvedValue(0); // not locked
      mockRedis.get.mockResolvedValue(null); // OTP expired

      const result = await service.verifyOtp(phoneNumber, otp);

      expect(result.success).toBe(false);
      expect(result.message).toContain('expired');
    });
  });

  describe('isPhoneLocked', () => {
    const phoneNumber = '+1234567890';

    it('should return locked state when phone is locked', async () => {
      const lockoutTtl = 1200;

      mockRedis.ttl.mockResolvedValue(lockoutTtl);

      const result = await service.isPhoneLocked(phoneNumber);

      expect(result.locked).toBe(true);
      expect(result.remainingMinutes).toBe(Math.ceil(lockoutTtl / 60));
    });

    it('should return unlocked state when phone is not locked', async () => {
      mockRedis.ttl.mockResolvedValue(-2); // no lock

      const result = await service.isPhoneLocked(phoneNumber);

      expect(result.locked).toBe(false);
      expect(result.remainingMinutes).toBeUndefined();
    });
  });
});
