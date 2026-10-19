import { Test, TestingModule } from '@nestjs/testing';
import { StorageService } from './storage.service';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as s3Presigner from '@aws-sdk/s3-request-presigner';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(async () => {
    process.env.AWS_S3_BUCKET_NAME = 'test-bucket';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              ({
                AWS_ACCESS_KEY_ID: 'test-access-key',
                AWS_SECRET_ACCESS_KEY: 'test-secret-key',
                AWS_S3_BUCKET_NAME: 'test-bucket',
                AWS_REGION: 'us-east-1',
              })[key],
          },
        },
      ],
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
      expect(result).not.toHaveProperty('fileKey');
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
      expect(result).not.toHaveProperty('fileKey');
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

  describe('getProofFileKey', () => {
    it('extracts a proof key only from an upload URL belonging to its owner and task', () => {
      const key = service.getProofFileKey(
        'https://storage.example.com/test-bucket/proofs/user1/task1/123?signature=secret',
        'user1',
        'task1',
      );

      expect(key).toBe('proofs/user1/task1/123');
    });

    it('rejects upload URLs belonging to another user or task', () => {
      expect(() =>
        service.getProofFileKey(
          'https://storage.example.com/proofs/user2/task1/123?signature=secret',
          'user1',
          'task1',
        ),
      ).toThrow(BadRequestException);
    });
  });
});
