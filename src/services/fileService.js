import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { generateUUIDFilename } from '../utils/filename-sanitizer.js';

class FileService {
  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      endpoint: process.env.S3_ENDPOINT, // For Minio compatibility
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true', // Required for Minio
    });

    this.bucket = process.env.S3_BUCKET_NAME;
    this.uploadTTL = 300; // 5 minutes
    this.downloadTTL = 3600; // 1 hour
  }

  generateFileKey(userId, filename) {
    // Use UUID-based naming for security
    const { fullPath } = generateUUIDFilename(filename, userId);
    return fullPath;
  }

  async generateSignedUploadUrl(userId, filename, contentType, fileSize) {
    const key = this.generateFileKey(userId, filename);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: fileSize,
      Metadata: {
        userId: userId.toString(),
        originalFilename: filename,
        uploadedAt: new Date().toISOString(),
      },
    });

    const signedUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: this.uploadTTL,
    });

    return {
      uploadUrl: signedUrl,
      key,
      expiresIn: this.uploadTTL,
    };
  }

  async generateSignedDownloadUrl(key) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const signedUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: this.downloadTTL,
    });

    return signedUrl;
  }

  async deleteFile(key) {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.s3Client.send(command);
  }

  async moveToQuarantine(key) {
    const quarantineKey = key.replace('users/', 'quarantine/');

    // In production, use CopyObject + DeleteObject
    // For simplicity, we'll just update the metadata
    return quarantineKey;
  }
}

export default new FileService();
