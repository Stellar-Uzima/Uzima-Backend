const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  NoSuchKey,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { StorageService } = require('./StorageService');

class S3Storage extends StorageService {
  constructor(options = {}) {
    super();
    this.bucket = options.bucket || process.env.S3_BUCKET_NAME;
    this.region = options.region || process.env.AWS_REGION || 'us-east-1';
    this.prefix = options.prefix || '';

    // Initialize S3 client
    this.s3Client = new S3Client({
      region: this.region,
      endpoint: options.endpoint || process.env.S3_ENDPOINT, // For Minio compatibility
      credentials: {
        accessKeyId: options.accessKeyId || process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: options.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY,
      },
      forcePathStyle: options.forcePathStyle || process.env.S3_FORCE_PATH_STYLE === 'true', // Required for Minio
    });
  }

  async upload(fileData, key, options = {}) {
    if (!this.bucket) {
      throw new Error('S3 bucket name is required');
    }

    const fullKey = this.prefix ? `${this.prefix}${key}` : key;

    const params = {
      Bucket: this.bucket,
      Key: fullKey,
      Body: fileData,
      ContentType: options.contentType || 'application/octet-stream',
      Metadata: {
        uploadedBy: options.userId || 'system',
        uploadedAt: new Date().toISOString(),
        originalFilename: options.originalFilename || key,
        ...options.metadata,
      },
    };

    try {
      await this.s3Client.send(new PutObjectCommand(params));

      // Get the file metadata after upload
      const metadata = await this.getFileMetadata(fullKey);
      return metadata;
    } catch (error) {
      throw new Error(`S3 upload failed: ${error.message}`);
    }
  }

  async download(key) {
    if (!this.bucket) {
      throw new Error('S3 bucket name is required');
    }

    const fullKey = this.prefix ? `${this.prefix}${key}` : key;

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: fullKey,
      });

      const response = await this.s3Client.send(command);
      // Convert the response body to buffer
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        throw new Error(`File not found in S3: ${key}`);
      }
      throw error;
    }
  }

  async delete(key) {
    if (!this.bucket) {
      throw new Error('S3 bucket name is required');
    }

    const fullKey = this.prefix ? `${this.prefix}${key}` : key;

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: fullKey,
      });

      await this.s3Client.send(command);
    } catch (error) {
      // S3 treats deletion of non-existent objects as success
      if (error.name !== 'NoSuchKey') {
        throw error;
      }
    }
  }

  async list(prefix = '', options = {}) {
    if (!this.bucket) {
      throw new Error('S3 bucket name is required');
    }

    const searchPrefix = this.prefix ? `${this.prefix}${prefix}` : prefix;

    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: searchPrefix,
        MaxKeys: options.maxKeys || 1000,
      });

      const response = await this.s3Client.send(command);

      if (!response.Contents) {
        return [];
      }

      const files = [];

      for (const obj of response.Contents) {
        // Skip directories (S3 doesn't have real directories, but some keys end with '/')
        if (obj.Key.endsWith('/')) continue;

        const relativeKey = this.prefix ? obj.Key.substring(this.prefix.length) : obj.Key;

        // Get detailed metadata for each file
        try {
          const metadata = await this.getFileMetadata(obj.Key);
          files.push(metadata);
        } catch (error) {
          // If we can't get metadata for a specific file, skip it
          console.warn(`Could not retrieve metadata for ${obj.Key}: ${error.message}`);
        }
      }

      return files;
    } catch (error) {
      throw error;
    }
  }

  async exists(key) {
    if (!this.bucket) {
      throw new Error('S3 bucket name is required');
    }

    const fullKey = this.prefix ? `${this.prefix}${key}` : key;

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: fullKey,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        return false;
      }
      throw error;
    }
  }

  async generatePresignedUrl(key, options = {}) {
    if (!this.bucket) {
      throw new Error('S3 bucket name is required');
    }

    const fullKey = this.prefix ? `${this.prefix}${key}` : key;
    const expiresIn = options.expiresIn || 3600; // 1 hour default
    const operation = options.operation || 'read';

    try {
      if (operation === 'write' || operation === 'upload') {
        // Generate presigned URL for upload
        const command = new PutObjectCommand({
          Bucket: this.bucket,
          Key: fullKey,
        });

        return await getSignedUrl(this.s3Client, command, {
          expiresIn,
        });
      } else {
        // Generate presigned URL for download (default)
        const command = new GetObjectCommand({
          Bucket: this.bucket,
          Key: fullKey,
        });

        return await getSignedUrl(this.s3Client, command, {
          expiresIn,
        });
      }
    } catch (error) {
      throw new Error(`Failed to generate presigned URL: ${error.message}`);
    }
  }

  async getFileMetadata(key) {
    if (!this.bucket) {
      throw new Error('S3 bucket name is required');
    }

    const fullKey = this.prefix ? `${this.prefix}${key}` : key;

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: fullKey,
      });

      const response = await this.s3Client.send(command);

      const relativeKey = this.prefix ? fullKey.substring(this.prefix.length) : fullKey;

      return {
        key: relativeKey,
        filename: relativeKey.split('/').pop(),
        mimeType: response.ContentType,
        size: response.ContentLength,
        uploadedBy: response.Metadata?.uploadedby || 'system',
        uploadedAt: response.Metadata?.uploadedat
          ? new Date(response.Metadata.uploadedat)
          : new Date(),
        additionalMetadata: {
          etag: response.ETag,
          lastModified: response.LastModified,
          storageClass: response.StorageClass,
          metadata: response.Metadata,
        },
      };
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        throw new Error(`File not found in S3: ${key}`);
      }
      throw error;
    }
  }
}

module.exports = { S3Storage };
