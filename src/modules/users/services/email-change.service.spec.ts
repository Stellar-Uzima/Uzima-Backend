import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { EmailChangeService } from './email-change.service';
import { User } from '../../../entities/user.entity';

describe('EmailChangeService', () => {
  let service: EmailChangeService;

  const baseTime = new Date('2026-06-29T10:00:00.000Z');

  const mockUser: Partial<User> = {
    id: 'user-1',
    email: 'old@example.com',
    isVerified: true,
  };

  const mockUserRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(baseTime);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailChangeService,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
      ],
    }).compile();

    service = module.get<EmailChangeService>(EmailChangeService);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // initiateChange
  // ---------------------------------------------------------------------------
  describe('initiateChange', () => {
    it('should return a hex token when the request is valid', async () => {
      mockUserRepository.findOne
        .mockResolvedValueOnce({ ...mockUser }) // findUser
        .mockResolvedValueOnce(null); // email-uniqueness check

      const result = await service.initiateChange('user-1', 'new@example.com');

      expect(result).toHaveProperty('token');
      expect(result.token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(
        service.initiateChange('missing-user', 'new@example.com'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when new email equals current email', async () => {
      mockUserRepository.findOne.mockResolvedValueOnce({ ...mockUser });

      await expect(
        service.initiateChange('user-1', 'old@example.com'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should be case-insensitive when comparing emails', async () => {
      mockUserRepository.findOne.mockResolvedValueOnce({ ...mockUser });

      await expect(
        service.initiateChange('user-1', 'OLD@EXAMPLE.COM'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when new email is already taken', async () => {
      mockUserRepository.findOne
        .mockResolvedValueOnce({ ...mockUser }) // findUser
        .mockResolvedValueOnce({ id: 'other-user', email: 'new@example.com' }); // email taken

      await expect(
        service.initiateChange('user-1', 'new@example.com'),
      ).rejects.toThrow(ConflictException);
    });

    it('should store a pending request retrievable via getPendingRequest', async () => {
      mockUserRepository.findOne
        .mockResolvedValueOnce({ ...mockUser })
        .mockResolvedValueOnce(null);

      await service.initiateChange('user-1', 'new@example.com');

      const pending = service.getPendingRequest('user-1');
      expect(pending).not.toBeNull();
      expect(pending!.newEmail).toBe('new@example.com');
      expect(pending!.userId).toBe('user-1');
      expect(pending!.confirmedAt).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // confirmChange
  // ---------------------------------------------------------------------------
  describe('confirmChange', () => {
    async function createPendingRequest() {
      mockUserRepository.findOne
        .mockResolvedValueOnce({ ...mockUser })
        .mockResolvedValueOnce(null);
      const { token } = await service.initiateChange(
        'user-1',
        'new@example.com',
      );
      jest.clearAllMocks();
      return token;
    }

    it('should update the user email and set isVerified to true', async () => {
      const token = await createPendingRequest();

      const updatedUser = {
        ...mockUser,
        email: 'new@example.com',
        isVerified: true,
      };
      mockUserRepository.findOne.mockResolvedValueOnce({ ...mockUser });
      mockUserRepository.save.mockResolvedValueOnce(updatedUser);

      const result = await service.confirmChange(token);

      expect(mockUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@example.com',
          isVerified: true,
        }),
      );
      expect(result.email).toBe('new@example.com');
    });

    it('should remove the pending request after confirmation', async () => {
      const token = await createPendingRequest();

      mockUserRepository.findOne.mockResolvedValueOnce({ ...mockUser });
      mockUserRepository.save.mockResolvedValueOnce({
        ...mockUser,
        email: 'new@example.com',
      });

      await service.confirmChange(token);

      const pending = service.getPendingRequest('user-1');
      expect(pending).toBeNull();
    });

    it('should throw BadRequestException for an invalid token', async () => {
      await expect(
        service.confirmChange('invalid-token-value'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when the token has expired', async () => {
      const token = await createPendingRequest();

      // Advance time past the 24-hour TTL
      jest.setSystemTime(
        new Date(baseTime.getTime() + 24 * 60 * 60 * 1000 + 1),
      );

      await expect(service.confirmChange(token)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should delete the expired token from the pending map', async () => {
      const token = await createPendingRequest();

      jest.setSystemTime(
        new Date(baseTime.getTime() + 24 * 60 * 60 * 1000 + 1),
      );

      await expect(service.confirmChange(token)).rejects.toThrow(
        BadRequestException,
      );

      // A second attempt should also fail (token was cleaned up)
      await expect(service.confirmChange(token)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if the user was deleted before confirmation', async () => {
      const token = await createPendingRequest();

      mockUserRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.confirmChange(token)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // cancelChange
  // ---------------------------------------------------------------------------
  describe('cancelChange', () => {
    it('should remove all pending requests for the given user', async () => {
      mockUserRepository.findOne
        .mockResolvedValueOnce({ ...mockUser })
        .mockResolvedValueOnce(null);

      await service.initiateChange('user-1', 'new@example.com');

      expect(service.getPendingRequest('user-1')).not.toBeNull();

      await service.cancelChange('user-1');

      expect(service.getPendingRequest('user-1')).toBeNull();
    });

    it('should not throw when no pending request exists for the user', async () => {
      await expect(
        service.cancelChange('user-with-no-pending'),
      ).resolves.toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // getPendingRequest
  // ---------------------------------------------------------------------------
  describe('getPendingRequest', () => {
    it('should return null when no pending request exists', () => {
      const result = service.getPendingRequest('nonexistent-user');
      expect(result).toBeNull();
    });

    it('should return null when the only pending request has expired', async () => {
      mockUserRepository.findOne
        .mockResolvedValueOnce({ ...mockUser })
        .mockResolvedValueOnce(null);

      await service.initiateChange('user-1', 'new@example.com');

      // Advance past 24h TTL
      jest.setSystemTime(
        new Date(baseTime.getTime() + 24 * 60 * 60 * 1000 + 1),
      );

      const result = service.getPendingRequest('user-1');
      expect(result).toBeNull();
    });

    it('should return the pending request when it is still valid', async () => {
      mockUserRepository.findOne
        .mockResolvedValueOnce({ ...mockUser })
        .mockResolvedValueOnce(null);

      await service.initiateChange('user-1', 'new@example.com');

      // Advance time but stay within the 24h window
      jest.setSystemTime(new Date(baseTime.getTime() + 12 * 60 * 60 * 1000));

      const result = service.getPendingRequest('user-1');
      expect(result).not.toBeNull();
      expect(result!.newEmail).toBe('new@example.com');
    });
  });
});
