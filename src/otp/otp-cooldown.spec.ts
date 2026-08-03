import { OtpService } from './otp.service';

const redisMock = {
  exists: jest.fn(),
  get: jest.fn(),
  ttl: jest.fn(),
  setex: jest.fn(),
  pipeline: jest.fn().mockReturnValue({
    incr: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    setex: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([[null, 1]]),
  }),
  del: jest.fn(),
};

jest.mock('ioredis', () => jest.fn().mockImplementation(() => redisMock));
jest.mock('../config/redis.config', () => ({
  redisConfig: jest.fn().mockReturnValue({}),
  getRedisUrl: jest.fn().mockReturnValue('redis://localhost:6379'),
}));

const mockConfigService = { get: jest.fn().mockReturnValue(undefined) };
const mockEventEmitter = { emit: jest.fn() };

describe('OtpService — resend cooldown', () => {
  let service: OtpService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OtpService(mockConfigService as any, mockEventEmitter as any);
  });

  it('should return 429-style response when cooldown is active', async () => {
    redisMock.exists.mockResolvedValue(0); // not locked
    redisMock.ttl.mockResolvedValue(45);   // 45s cooldown remaining

    const result = await service.requestOtp('+2348012345678');

    expect(result.success).toBe(false);
    expect(result.retryAfter).toBe(45);
  });

  it('should allow OTP request when cooldown has expired', async () => {
    redisMock.exists.mockResolvedValue(0);
    redisMock.ttl.mockResolvedValue(-2); // key does not exist
    redisMock.get.mockResolvedValue('1'); // 1 request so far
    redisMock.setex.mockResolvedValue('OK');

    const result = await service.requestOtp('+2348012345678');

    expect(result.success).toBe(true);
    expect(redisMock.setex).toHaveBeenCalledWith(
      expect.stringContaining('otp_resend_cooldown:'),
      60,
      '1',
    );
  });

  it('should allow retry attempt at the exact cooldown-expiry moment (ttl <= 0 boundary)', async () => {
    redisMock.exists.mockResolvedValue(0); // not locked
    redisMock.ttl.mockResolvedValue(0);    // TTL returned 0 at exact expiry moment
    redisMock.get.mockResolvedValue('0');
    redisMock.setex.mockResolvedValue('OK');

    const result = await service.requestOtp('+2348012345678');

    expect(result.success).toBe(true);
    expect(result.message).toBe('OTP sent successfully');
  });

  it('should reject second request during rapid sequential retry attempts while cooldown is active', async () => {
    // First request: no cooldown active
    redisMock.exists.mockResolvedValue(0);
    redisMock.ttl.mockResolvedValueOnce(-2); // Cooldown check for 1st attempt: expired/none
    redisMock.get.mockResolvedValue('0');
    redisMock.setex.mockResolvedValue('OK');

    const firstResult = await service.requestOtp('+2348012345678');

    expect(firstResult.success).toBe(true);
    expect(firstResult.message).toBe('OTP sent successfully');

    // Second rapid request: cooldown active (60s remaining)
    redisMock.ttl.mockResolvedValueOnce(60); // Cooldown check for 2nd rapid attempt: active

    const secondResult = await service.requestOtp('+2348012345678');

    expect(secondResult.success).toBe(false);
    expect(secondResult.message).toBe('Please wait before requesting a new OTP');
    expect(secondResult.retryAfter).toBe(60);
  });
});