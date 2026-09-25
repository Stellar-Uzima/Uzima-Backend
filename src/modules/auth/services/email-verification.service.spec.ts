import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GoneException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailVerificationService } from './email-verification.service';
import { EmailVerification } from '../../../database/entities/email-verification.entity';
import { UsersService } from './users.service';
import { NotificationService } from '../../../notifications/services/notification.service';

/** Unit tests for EmailVerificationService.consume edge cases (#1343). */
describe('EmailVerificationService', () => {
  let service: EmailVerificationService;
  const mockRepo = { findOne: jest.fn(), save: jest.fn(), create: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailVerificationService,
        { provide: getRepositoryToken(EmailVerification), useValue: mockRepo },
        { provide: UsersService, useValue: { findById: jest.fn() } },
        { provide: NotificationService, useValue: { sendMultiChannel: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();
    service = module.get<EmailVerificationService>(EmailVerificationService);
  });

  it('returns null for an unknown token', async () => {
    mockRepo.findOne.mockResolvedValue(null);
    expect(await service.consume('missing-token')).toBeNull();
  });

  it('returns null for an already-consumed token', async () => {
    mockRepo.findOne.mockResolvedValue({ consumedAt: new Date(), expiresAt: new Date(Date.now() + 1000) });
    expect(await service.consume('used-token')).toBeNull();
  });

  it('throws GoneException for an expired token', async () => {
    mockRepo.findOne.mockResolvedValue({ consumedAt: null, expiresAt: new Date(Date.now() - 1000) });
    await expect(service.consume('expired-token')).rejects.toThrow(GoneException);
  });
});
