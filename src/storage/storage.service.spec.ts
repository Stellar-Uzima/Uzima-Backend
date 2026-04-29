import { Test, TestingModule } from '@nestjs/testing';
import { StorageService } from './storage.service';
import { BadRequestException } from '@nestjs/common';
import * as s3Presigner from '@aws-sdk/s3-request-presigner';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(async () => {
    process.env.AWS_S3_BUCKET_NAME = 'test-bucket';

    const module: TestingModule = await Test.createTestingModule({
      providers: [StorageService],
    }).compile();

    service = module.get<StorageService>(StorageService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generatePresignedUploadUrl', () => {
    it('should successfully generate a URL for image/jpeg', async () => {
      const mockUrl =
        'https://test-bucket.s3.amazonaws.com/proofs/user1/task1/1234567890?signature=xyz';
      (s3Presigner.getSignedUrl as jest.Mock).mockResolvedValue(mockUrl);

      const result = await service.generatePresignedUploadUrl(
        'user1',
        'task1',
        'image/jpeg',
      );

      expect(result).toHaveProperty('uploadUrl', mockUrl);
      expect(result).toHaveProperty('fileKey');
      expect(result.fileKey).toMatch(/^proofs\/user1\/task1\/\d+$/);
      expect(s3Presigner.getSignedUrl).toHaveBeenCalledTimes(1);
    });

    it('should successfully generate a URL for image/png', async () => {
      const mockUrl =
        'https://test-bucket.s3.amazonaws.com/proofs/user2/task2/1234567890?signature=abc';
      (s3Presigner.getSignedUrl as jest.Mock).mockResolvedValue(mockUrl);

      const result = await service.generatePresignedUploadUrl(
        'user2',
        'task2',
        'image/png',
      );

      expect(result).toHaveProperty('uploadUrl', mockUrl);
      expect(result).toHaveProperty('fileKey');
      expect(result.fileKey).toMatch(/^proofs\/user2\/task2\/\d+$/);
    });

    it('should throw BadRequestException for invalid content type', async () => {
      await expect(
        service.generatePresignedUploadUrl(
          'user3',
          'task3',
          'application/pdf' as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
