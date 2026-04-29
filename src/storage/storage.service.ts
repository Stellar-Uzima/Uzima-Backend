import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService {
  private s3Client: S3Client;
  private readonly logger = new Logger(StorageService.name);
  private bucketName: string;

  constructor() {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    this.bucketName = process.env.AWS_S3_BUCKET_NAME || '';

    if (!accessKeyId || !secretAccessKey) {
      this.logger.error('AWS Credentials are missing from environment variables!');
      throw new Error('StorageService: Missing AWS Credentials');
    }

    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      endpoint: process.env.AWS_S3_ENDPOINT,
      forcePathStyle: true,
    });
  }

  /**
   * Uploads a file directly from the server to S3
   */
  async uploadFile(file: any, folder: string = 'general'): Promise<string> {
    // Explicitly cast to avoid Multer namespace errors
    const multerFile = file as {
      originalname: string;
      buffer: Buffer;
      mimetype: string;
    };

    const timestamp = Date.now();
    const fileKey = `${folder}/${timestamp}-${multerFile.originalname}`;

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: fileKey,
          Body: multerFile.buffer,
          ContentType: multerFile.mimetype,
        })
      );
      this.logger.log(`File uploaded successfully: ${fileKey}`);
      return fileKey;
    } catch (error: any) {
      this.logger.error(`Failed to upload file to S3`, error?.stack);
      throw new Error('Cloud storage upload failed');
    }
  }

  /**
   * Generates a download URL for a specific file
   */
  async getDownloadUrl(fileKey: string, expiresIn: number = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
      });

      return await getSignedUrl(this.s3Client, command, { expiresIn });
    } catch (error: any) {
      this.logger.error(`Failed to generate download URL for ${fileKey}`, error?.message);
      throw new Error('Could not generate file access URL');
    }
  }

  /**
   * Deletes a file from S3
   */
  async deleteFile(fileKey: string): Promise<void> {
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: fileKey,
        })
      );
      this.logger.log(`File deleted successfully: ${fileKey}`);
    } catch (error: any) {
      this.logger.error(`Failed to delete file ${fileKey}`, error?.message);
      throw new Error('Cloud storage deletion failed');
    }
  }

  /**
   * Generates a pre-signed URL for direct-to-S3 uploads
   */
  async generatePresignedUploadUrl(
    userId: string,
    taskId: string,
    contentType: 'image/jpeg' | 'image/png'
  ) {
    if (contentType !== 'image/jpeg' && contentType !== 'image/png') {
      throw new BadRequestException(
        'Invalid content type. Only image/jpeg and image/png are allowed.'
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
      const uploadUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: 900,
      });

      return { uploadUrl, fileKey };
    } catch (error: any) {
      this.logger.error('Failed to generate pre-signed URL', error?.message);
      throw new Error('Failed to generate pre-signed URL');
    }
  }

  /**
   * Verifies that a file exists in S3
   */
  async verifyFileExists(fileKey: string): Promise<{
    exists: boolean;
    contentType?: string;
    size?: number;
  }> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
      });

      const response = await this.s3Client.send(command);

      return {
        exists: true,
        contentType: response.ContentType,
        size: response.ContentLength,
      };
    } catch (error: any) {
      if (error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404) {
        return { exists: false };
      }
      this.logger.error(`Unexpected error verifying file: ${error?.message}`);
      throw error;
    }
  }
}
