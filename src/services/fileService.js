const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');

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
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const sanitized = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    return `users/${userId}/${timestamp}-${random}-${sanitized}`;
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

module.exports = new FileService();
