import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService {
  private s3Client: S3Client;
  private readonly logger = new Logger(StorageService.name);
  private bucketName: string;

  constructor() {
    this.bucketName = process.env.AWS_S3_BUCKET_NAME;

    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
      endpoint: process.env.AWS_S3_ENDPOINT,
      forcePathStyle: true, // Often required for R2/MinIO
    });
  }

  /**
   * Generates a pre-signed URL for direct-to-S3 uploads
   * @param userId The ID of the user uploading the file
   * @param taskId The target task this proof justifies
   * @param contentType The MIME type of the upload (restricts allowable uploads)
   */
  async generatePresignedUploadUrl(
    userId: string,
    taskId: string,
    contentType: 'image/jpeg' | 'image/png',
  ) {
    if (contentType !== 'image/jpeg' && contentType !== 'image/png') {
      throw new BadRequestException(
        'Invalid content type. Only image/jpeg and image/png are allowed.',
      );
    }

    const timestamp = Date.now();
    const fileKey = `proofs/${userId}/${taskId}/${timestamp}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: fileKey,
      ContentType: contentType,
    });

    try {
      // 15 minutes = 900 seconds
      const uploadUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: 900,
      });

      this.logger.log(
        `Generated pre-signed URL for user ${userId}, task ${taskId}`,
      );

      return {
        uploadUrl,
        fileKey,
      };
    } catch (error) {
      this.logger.error('Failed to generate pre-signed URL', error);
      throw new Error('Failed to generate pre-signed URL');
    }
  }
}
