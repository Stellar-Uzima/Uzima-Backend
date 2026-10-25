import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AvatarService } from './avatar.service';
import { User } from '../../../entities/user.entity';
import { StorageService } from '../../../shared/storage/storage.service';
import { ActivityTrackerService } from './activity-tracker.service';

jest.mock('sharp', () => {
  const chain = {
    resize: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('resized')),
  };
  return jest.fn(() => chain);
});

const mockUserRepository = {
  findOne: jest.fn(),
  update: jest.fn(),
};

const mockStorageService = {
  saveFile: jest.fn(),
  deleteFileByUrl: jest.fn(),
};

const mockActivityTracker = {
  trackAvatarUpdated: jest.fn(),
};

// Helper: build a valid JPEG buffer (3-byte magic number + filler)
function makeJpegBuffer(extra: number = 100): Buffer {
  const sig = Buffer.from([0xff, 0xd8, 0xff]);
  return Buffer.concat([sig, Buffer.alloc(extra)]);
}

describe('AvatarService', () => {
  let service: AvatarService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvatarService,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: StorageService, useValue: mockStorageService },
        { provide: ActivityTrackerService, useValue: mockActivityTracker },
      ],
    }).compile();

    service = module.get<AvatarService>(AvatarService);
    jest.clearAllMocks();
  });

  describe('uploadAvatar', () => {
    const userId = 'user-123';
    const file = makeJpegBuffer(100); // valid JPEG magic number
    const originalName = 'avatar.jpg';
    const mimetype = 'image/jpeg';

    it('should upload avatar and return url/filename', async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: userId, avatarUrl: null });
      mockStorageService.saveFile.mockResolvedValue({
        url: '/uploads/avatars/new.jpg',
        filename: 'new.jpg',
      });

      const result = await service.uploadAvatar(userId, file, originalName, mimetype);

      expect(mockStorageService.saveFile).toHaveBeenCalled();
      expect(mockUserRepository.update).toHaveBeenCalledWith(userId, {
        avatarUrl: '/uploads/avatars/new.jpg',
      });
      expect(result).toEqual({ url: '/uploads/avatars/new.jpg', filename: 'new.jpg' });
    });

    it('should delete old avatar when replacing', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        id: userId,
        avatarUrl: '/uploads/avatars/old.jpg',
      });
      mockStorageService.saveFile.mockResolvedValue({
        url: '/uploads/avatars/new.jpg',
        filename: 'new.jpg',
      });

      await service.uploadAvatar(userId, file, originalName, mimetype);

      expect(mockStorageService.deleteFileByUrl).toHaveBeenCalledWith('/uploads/avatars/old.jpg');
    });

    it('should not call deleteFileByUrl when user has no previous avatar', async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: userId, avatarUrl: null });
      mockStorageService.saveFile.mockResolvedValue({
        url: '/uploads/avatars/new.jpg',
        filename: 'new.jpg',
      });

      await service.uploadAvatar(userId, file, originalName, mimetype);

      expect(mockStorageService.deleteFileByUrl).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.uploadAvatar(userId, file, originalName, mimetype)).rejects.toThrow(
        NotFoundException
      );
    });

    it('should throw BadRequestException for unsupported mime type', async () => {
      await expect(service.uploadAvatar(userId, file, originalName, 'image/gif')).rejects.toThrow(
        BadRequestException
      );
    });

    it('should throw BadRequestException for mismatched extension and mime type', async () => {
      await expect(service.uploadAvatar(userId, file, 'avatar.png', mimetype)).rejects.toThrow(
        BadRequestException
      );
    });

    it('should throw BadRequestException when file content does not match declared mime', async () => {
      // PNG magic number buffer but declared as JPEG
      const pngBuffer = Buffer.from([
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
        ...Array(92).fill(0),
      ]);
      await expect(service.uploadAvatar(userId, pngBuffer, originalName, mimetype)).rejects.toThrow(
        BadRequestException
      );
    });

    it('should throw BadRequestException when file exceeds 5MB', async () => {
      const largeFile = Buffer.concat([
        Buffer.from([0xff, 0xd8, 0xff]),
        Buffer.alloc(6 * 1024 * 1024),
      ]);

      await expect(service.uploadAvatar(userId, largeFile, originalName, mimetype)).rejects.toThrow(
        BadRequestException
      );
    });

    it('should track avatar update activity', async () => {
      const req = { ip: '127.0.0.1' };
      mockUserRepository.findOne.mockResolvedValue({ id: userId, avatarUrl: null });
      mockStorageService.saveFile.mockResolvedValue({
        url: '/uploads/avatars/new.jpg',
        filename: 'new.jpg',
      });

      await service.uploadAvatar(userId, file, originalName, mimetype, req);

      expect(mockActivityTracker.trackAvatarUpdated).toHaveBeenCalledWith(
        userId,
        '/uploads/avatars/new.jpg',
        req
      );
    });
  });

  describe('deleteAvatar', () => {
    const userId = 'user-123';

    it('should delete avatar and clear avatarUrl', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        id: userId,
        avatarUrl: '/uploads/avatars/old.jpg',
      });

      await service.deleteAvatar(userId);

      expect(mockStorageService.deleteFileByUrl).toHaveBeenCalledWith('/uploads/avatars/old.jpg');
      expect(mockUserRepository.update).toHaveBeenCalledWith(userId, { avatarUrl: null });
      expect(mockActivityTracker.trackAvatarUpdated).toHaveBeenCalledWith(userId, '', undefined);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.deleteAvatar(userId)).rejects.toThrow(NotFoundException);
    });

    it('should do nothing when user has no avatar', async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: userId, avatarUrl: null });

      await service.deleteAvatar(userId);

      expect(mockStorageService.deleteFileByUrl).not.toHaveBeenCalled();
      expect(mockUserRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('getAvatarUrl', () => {
    const userId = 'user-123';

    it('should return avatarUrl when user has one', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        id: userId,
        avatarUrl: '/uploads/avatars/pic.jpg',
      });

      const result = await service.getAvatarUrl(userId);

      expect(result).toBe('/uploads/avatars/pic.jpg');
    });

    it('should return null when user has no avatar', async () => {
      mockUserRepository.findOne.mockResolvedValue({ id: userId, avatarUrl: null });

      const result = await service.getAvatarUrl(userId);

      expect(result).toBeNull();
    });

    it('should return null when user does not exist', async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      const result = await service.getAvatarUrl(userId);

      expect(result).toBeNull();
    });
  });
});
