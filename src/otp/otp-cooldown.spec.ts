import { OtpService } from './otp.service';

const redisMock = {
  exists: jest.fn(),
  get: jest.fn(),
  ttl: jest.fn(),
  setex: jest.fn(),
  pipeline: jest.fn().mockReturnValue({
    incr: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
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
    expect(result.message).toContain('45');
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
});