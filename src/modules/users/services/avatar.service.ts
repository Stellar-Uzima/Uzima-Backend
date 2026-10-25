import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../../entities/user.entity';
import { StorageService } from '../../../shared/storage/storage.service';
import { ActivityTrackerService } from './activity-tracker.service';
import { validateUploadWithDetection } from '../../../common/utils/file-upload-validator.util';
import sharp from 'sharp';

const ALLOWED_AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_AVATAR_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const THUMBNAIL_SIZE = { width: 200, height: 200 };

@Injectable()
export class AvatarService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly storageService: StorageService,
    private readonly activityTracker: ActivityTrackerService
  ) {}

  async uploadAvatar(
    userId: string,
    file: Buffer,
    originalName: string,
    mimetype: string,
    request?: any
  ): Promise<{ url: string; filename: string }> {
    this.validateFile(file, originalName, mimetype);

    const resizedImage = await this.resizeImage(file);

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const oldAvatarUrl = user.avatarUrl;

    const uploadResult = await this.storageService.saveFile(
      resizedImage,
      originalName,
      mimetype,
      'avatars'
    );

    await this.userRepository.update(userId, {
      avatarUrl: uploadResult.url,
    });

    if (oldAvatarUrl) {
      await this.storageService.deleteFileByUrl(oldAvatarUrl);
    }

    await this.activityTracker.trackAvatarUpdated(userId, uploadResult.url, request);

    return {
      url: uploadResult.url,
      filename: uploadResult.filename,
    };
  }

  async deleteAvatar(userId: string, request?: any): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.avatarUrl) {
      await this.storageService.deleteFileByUrl(user.avatarUrl);
      await this.userRepository.update(userId, {
        avatarUrl: null,
      });

      await this.activityTracker.trackAvatarUpdated(userId, '', request);
    }
  }

  async getAvatarUrl(userId: string): Promise<string | null> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    return user?.avatarUrl || null;
  }

  private validateFile(file: Buffer, originalName: string, mimetype: string): void {
    validateUploadWithDetection(
      {
        mimetype,
        size: file.length,
        filename: originalName,
        buffer: file,
      },
      {
        allowedMimeTypes: ALLOWED_AVATAR_MIME_TYPES,
        maxBytes: MAX_AVATAR_FILE_SIZE,
      }
    );
  }

  private async resizeImage(file: Buffer): Promise<Buffer> {
    try {
      return await sharp(file)
        .resize(THUMBNAIL_SIZE.width, THUMBNAIL_SIZE.height, {
          fit: 'cover',
          position: 'center',
        })
        .jpeg({ quality: 80 })
        .toBuffer();
    } catch (error) {
      throw new BadRequestException('Failed to process image');
    }
  }
}
