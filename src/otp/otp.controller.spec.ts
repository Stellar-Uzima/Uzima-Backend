import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { OtpController } from './otp.controller';
import { OtpService } from './otp.service';

describe('OtpController', () => {
  let controller: OtpController;
  let service: OtpService;

  beforeEach(async () => {
    const mockOtpService = {
      requestOtp: jest.fn(),
      verifyOtp: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OtpController],
      providers: [
        {
          provide: OtpService,
          useValue: mockOtpService,
        },
      ],
    }).compile();

    controller = module.get<OtpController>(OtpController);
    service = module.get<OtpService>(OtpService);
  });

  describe('requestOtp', () => {
    const phoneNumber = '+1234567890';
    let mockResponse: any;

    beforeEach(() => {
      mockResponse = {
        status: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };
    });

    it('should return 200 when OTP is successfully generated', async () => {
      const successResult = {
        success: true,
        message: 'OTP sent successfully',
        remainingAttempts: 2,
      };

      jest.spyOn(service, 'requestOtp').mockResolvedValue(successResult);

      await controller.requestOtp({ phoneNumber }, mockResponse);

      expect(mockResponse.status).not.toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
      expect(mockResponse.json).toHaveBeenCalledWith(successResult);
    });

    it('should return 429 with Retry-After header when cooldown is active', async () => {
      const cooldownResult = {
        success: false,
        message: 'Please wait before requesting a new OTP',
        retryAfter: 45,
      };

      jest.spyOn(service, 'requestOtp').mockResolvedValue(cooldownResult);

      await controller.requestOtp({ phoneNumber }, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
      expect(mockResponse.set).toHaveBeenCalledWith('Retry-After', '45');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Please wait before requesting a new OTP',
        retryAfter: 45,
      });
    });

    it('should return 200 for other errors (rate limit, lockout)', async () => {
      const rateLimitResult = {
        success: false,
        message: 'Maximum OTP requests exceeded. Please try again later.',
        remainingAttempts: 0,
        lockoutMinutes: 30,
      };

      jest.spyOn(service, 'requestOtp').mockResolvedValue(rateLimitResult);

      await controller.requestOtp({ phoneNumber }, mockResponse);

      expect(mockResponse.status).not.toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
      expect(mockResponse.json).toHaveBeenCalledWith(rateLimitResult);
    });

    it('should include Retry-After header value as seconds', async () => {
      const cooldownResult = {
        success: false,
        message: 'Please wait before requesting a new OTP',
        retryAfter: 60,
      };

      jest.spyOn(service, 'requestOtp').mockResolvedValue(cooldownResult);

      await controller.requestOtp({ phoneNumber }, mockResponse);

      expect(mockResponse.set).toHaveBeenCalledWith('Retry-After', '60');
    });
  });

  describe('verifyOtp', () => {
    it('should verify OTP successfully', async () => {
      const verifyResult = {
        success: true,
        message: 'OTP verified successfully',
      };

      jest.spyOn(service, 'verifyOtp').mockResolvedValue(verifyResult);

      const result = await controller.verifyOtp({
        phoneNumber: '+1234567890',
        otp: '123456',
      });

      expect(result).toEqual(verifyResult);
    });

    it('should reject invalid OTP', async () => {
      const verifyResult = {
        success: false,
        message: 'Invalid OTP. 2 attempt(s) remaining.',
      };

      jest.spyOn(service, 'verifyOtp').mockResolvedValue(verifyResult);

      const result = await controller.verifyOtp({
        phoneNumber: '+1234567890',
        otp: '654321',
      });

      expect(result).toEqual(verifyResult);
    });
  });
});
