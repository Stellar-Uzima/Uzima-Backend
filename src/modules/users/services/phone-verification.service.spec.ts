import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../../entities/user.entity';
import { SmsService } from '../../../shared/sms/sms.service';
import { PhoneVerificationService } from './phone-verification.service';

describe('PhoneVerificationService', () => {
  let service: PhoneVerificationService;
  let userRepository: jest.Mocked<Repository<User>>;
  let smsService: jest.Mocked<SmsService>;

  const baseTime = new Date('2026-04-22T10:00:00.000Z');
  const mockUser: User = {
    id: 'user-1',
    email: 'test@example.com',
    phoneNumber: '+254700123456',
    country: 'KE',
    preferredLanguage: 'en',
    firstName: 'Test',
    lastName: 'User',
    password: null,
    role: 'USER' as User['role'],
    isActive: true,
    isVerified: false,
    emailVerificationToken: null,
    emailVerificationExpiry: null,
    passwordResetToken: null,
    passwordResetExpiry: null,
    walletAddress: null,
    stellarWalletAddress: null,
    dailyXlmEarned: 0,
    lastActiveAt: null,
    createdAt: baseTime,
    updatedAt: baseTime,
    referralRecords: [],
  };

  const mockUserRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockSmsService = {
    sendVerificationCode: jest.fn(),
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(baseTime);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PhoneVerificationService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: SmsService,
          useValue: mockSmsService,
        },
      ],
    }).compile();

    service = module.get<PhoneVerificationService>(PhoneVerificationService);
    userRepository = module.get(getRepositoryToken(User));
    smsService = module.get(SmsService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('sends an SMS verification code with a 10 minute expiry', async () => {
    userRepository.findOne.mockResolvedValue({ ...mockUser });

    const result = await service.sendCode(mockUser.id, mockUser.phoneNumber);

    expect(smsService.sendVerificationCode).toHaveBeenCalledWith(
      mockUser.phoneNumber,
      expect.stringMatching(/^\d{6}$/),
    );
    expect(result.phoneNumber).toBe(mockUser.phoneNumber);
    expect(result.expiresAt.toISOString()).toBe('2026-04-22T10:10:00.000Z');
    expect(result.resendAvailableAt.toISOString()).toBe(
      '2026-04-22T10:01:00.000Z',
    );
  });

  it('rejects validation after the 10 minute expiry window', async () => {
    userRepository.findOne.mockResolvedValue({ ...mockUser });

    await service.sendCode(mockUser.id, mockUser.phoneNumber);
    const sentCode = smsService.sendVerificationCode.mock.calls[0][1];

    jest.setSystemTime(new Date('2026-04-22T10:10:00.001Z'));

    await expect(service.validateCode(mockUser.id, sentCode)).rejects.toThrow(
      new BadRequestException('Verification code is invalid or expired'),
    );
  });

  it('allows a resend after the cooldown and sends a new SMS code', async () => {
    userRepository.findOne.mockResolvedValue({ ...mockUser });

    await service.sendCode(mockUser.id, mockUser.phoneNumber);
    const firstCode = smsService.sendVerificationCode.mock.calls[0][1];

    jest.setSystemTime(new Date('2026-04-22T10:01:01.000Z'));

    const resendResult = await service.resendCode(mockUser.id);
    const resentCode = smsService.sendVerificationCode.mock.calls[1][1];

    expect(smsService.sendVerificationCode).toHaveBeenCalledTimes(2);
    expect(resentCode).toMatch(/^\d{6}$/);
    expect(resentCode).not.toBe(firstCode);
    expect(resendResult.resendAvailableAt.toISOString()).toBe(
      '2026-04-22T10:02:01.000Z',
    );
  });

  it('marks the phone as verified when the submitted code is valid', async () => {
    userRepository.findOne.mockResolvedValue({ ...mockUser });
    userRepository.save.mockImplementation(async (user) => user as User);

    await service.sendCode(mockUser.id, mockUser.phoneNumber);
    const sentCode = smsService.sendVerificationCode.mock.calls[0][1];

    const verifiedUser = await service.markPhoneAsVerified(
      mockUser.id,
      sentCode,
    );

    expect(userRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        phoneNumber: mockUser.phoneNumber,
        isVerified: true,
      }),
    );
    expect(verifiedUser.isVerified).toBe(true);
  });

  it('blocks resend requests during the cooldown window', async () => {
    userRepository.findOne.mockResolvedValue({ ...mockUser });

    await service.sendCode(mockUser.id, mockUser.phoneNumber);

    await expect(service.resendCode(mockUser.id)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    } satisfies Partial<HttpException>);
  });
});