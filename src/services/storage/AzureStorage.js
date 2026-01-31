const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  AnonymousCredential,
} = require('@azure/storage-blob');
const { StorageService } = require('./StorageService');

class AzureStorage extends StorageService {
  constructor(options = {}) {
    super();
    this.accountName = options.accountName || process.env.AZURE_STORAGE_ACCOUNT_NAME;
    this.accountKey = options.accountKey || process.env.AZURE_STORAGE_ACCOUNT_KEY;
    this.containerName = options.containerName || process.env.AZURE_STORAGE_CONTAINER_NAME;
    this.sasToken = options.sasToken || process.env.AZURE_STORAGE_SAS_TOKEN;
    this.prefix = options.prefix || '';

    // Initialize Azure Blob Service Client
    if (this.accountKey) {
      // Use shared key credential
      const credential = new StorageSharedKeyCredential(this.accountName, this.accountKey);
      this.blobServiceClient = new BlobServiceClient(
        `https://${this.accountName}.blob.core.windows.net`,
        credential
      );
    } else if (this.sasToken) {
      // Use SAS token
      this.blobServiceClient = new BlobServiceClient(
        `https://${this.accountName}.blob.core.windows.net?${this.sasToken}`
      );
    } else {
      // Use anonymous access (not recommended for production)
      this.blobServiceClient = new BlobServiceClient(
        `https://${this.accountName}.blob.core.windows.net`,
        new AnonymousCredential()
      );
    }
  }

  async upload(fileData, key, options = {}) {
    if (!this.accountName || !this.containerName) {
      throw new Error('Azure Storage Account Name and Container Name are required');
    }

    const fullKey = this.prefix ? `${this.prefix}${key}` : key;
    const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
    const blobClient = containerClient.getBlockBlobClient(fullKey);

    const uploadOptions = {
      blobHTTPHeaders: {
        blobContentType: options.contentType || 'application/octet-stream',
      },
      metadata: {
        uploadedBy: options.userId || 'system',
        uploadedAt: new Date().toISOString(),
        originalFilename: options.originalFilename || key,
        ...options.metadata,
      },
    };

    try {
      await blobClient.uploadData(fileData, uploadOptions);

      // Get the file metadata after upload
      const metadata = await this.getFileMetadata(fullKey);
      return metadata;
    } catch (error) {
      throw new Error(`Azure Storage upload failed: ${error.message}`);
    }
  }

  async download(key) {
    if (!this.accountName || !this.containerName) {
      throw new Error('Azure Storage Account Name and Container Name are required');
    }

    const fullKey = this.prefix ? `${this.prefix}${key}` : key;
    const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
    const blobClient = containerClient.getBlobClient(fullKey);

    try {
      const downloadBlockBlobResponse = await blobClient.download();

      // Read the entire stream into a buffer
      const buffer = await this.streamToBuffer(downloadBlockBlobResponse.readableStreamBody);
      return buffer;
    } catch (error) {
      if (error.statusCode === 404) {
        throw new Error(`File not found in Azure Storage: ${key}`);
      }
      throw error;
    }
  }

  async delete(key) {
    if (!this.accountName || !this.containerName) {
      throw new Error('Azure Storage Account Name and Container Name are required');
    }

    const fullKey = this.prefix ? `${this.prefix}${key}` : key;
    const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
    const blobClient = containerClient.getBlobClient(fullKey);

    try {
      await blobClient.deleteIfExists();
    } catch (error) {
      throw error;
    }
  }

  async list(prefix = '', options = {}) {
    if (!this.accountName || !this.containerName) {
      throw new Error('Azure Storage Account Name and Container Name are required');
    }

    const searchPrefix = this.prefix ? `${this.prefix}${prefix}` : prefix;
    const containerClient = this.blobServiceClient.getContainerClient(this.containerName);

    try {
      const blobs = containerClient.listBlobsFlat({
        prefix: searchPrefix,
      });

      const files = [];

      for await (const blob of blobs) {
        // Skip directories
        if (blob.name.endsWith('/')) continue;

        const relativeKey = this.prefix ? blob.name.substring(this.prefix.length) : blob.name;

        files.push({
          key: relativeKey,
          filename: blob.name.split('/').pop(),
          mimeType: blob.properties.contentType,
          size: blob.properties.contentLength,
          uploadedBy: blob.metadata?.uploadedby || 'system',
          uploadedAt: blob.metadata?.uploadedat
            ? new Date(blob.metadata.uploadedat)
            : new Date(blob.properties.lastModified),
          additionalMetadata: {
            lastModified: blob.properties.lastModified,
            etag: blob.properties.etag,
            blobType: blob.properties.blobType,
            metadata: blob.metadata,
          },
        });
      }

      return files;
    } catch (error) {
      throw error;
    }
  }

  async exists(key) {
    if (!this.accountName || !this.containerName) {
      throw new Error('Azure Storage Account Name and Container Name are required');
    }

    const fullKey = this.prefix ? `${this.prefix}${key}` : key;
    const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
    const blobClient = containerClient.getBlobClient(fullKey);

    try {
      const properties = await blobClient.getProperties();
      return !!properties;
    } catch (error) {
      if (error.statusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  async generatePresignedUrl(key, options = {}) {
    if (!this.accountName || !this.containerName) {
      throw new Error('Azure Storage Account Name and Container Name are required');
    }

    const fullKey = this.prefix ? `${this.prefix}${key}` : key;
    const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
    const blobClient = containerClient.getBlobClient(fullKey);

    const expiresIn = options.expiresIn || 3600; // 1 hour default
    const operation = options.operation || 'read';

    try {
      // For Azure, we need to generate a Shared Access Signature (SAS)
      // This requires the account key for security reasons
      if (!this.accountKey) {
        throw new Error('Account key is required to generate SAS tokens');
      }

      const start = new Date();
      const expiry = new Date(start.getTime() + expiresIn * 1000);

      // Create the SAS token
      const sasToken = this.generateBlobSasToken(fullKey, operation, start, expiry);

      return `https://${this.accountName}.blob.core.windows.net/${this.containerName}/${fullKey}?${sasToken}`;
    } catch (error) {
      throw new Error(`Failed to generate presigned URL: ${error.message}`);
    }
  }

  async getFileMetadata(key) {
    if (!this.accountName || !this.containerName) {
      throw new Error('Azure Storage Account Name and Container Name are required');
    }

    const fullKey = this.prefix ? `${this.prefix}${key}` : key;
    const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
    const blobClient = containerClient.getBlobClient(fullKey);

    try {
      const properties = await blobClient.getProperties();

      const relativeKey = this.prefix ? fullKey.substring(this.prefix.length) : fullKey;

      return {
        key: relativeKey,
        filename: fullKey.split('/').pop(),
        mimeType: properties.contentType,
        size: properties.contentLength,
        uploadedBy: properties.metadata?.uploadedby || 'system',
        uploadedAt: properties.metadata?.uploadedat
          ? new Date(properties.metadata.uploadedat)
          : new Date(properties.lastModified),
        additionalMetadata: {
          lastModified: properties.lastModified,
          etag: properties.etag,
          blobType: properties.blobType,
          metadata: properties.metadata,
          contentEncoding: properties.contentEncoding,
          contentDisposition: properties.contentDisposition,
        },
      };
    } catch (error) {
      if (error.statusCode === 404) {
        throw new Error(`File not found in Azure Storage: ${key}`);
      }
      throw error;
    }
  }

  // Helper function to convert stream to buffer
  async streamToBuffer(readableStream) {
    const chunks = [];
    for await (const chunk of readableStream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  // Helper function to generate blob SAS token
  generateBlobSasToken(blobName, permissions, start, expiry) {
    // Import azure-storage to generate SAS
    const { generateBlobSASQueryParameters, BlobSASPermissions } = require('@azure/storage-blob');

    // Define permissions based on operation
    let sasPermissions = new BlobSASPermissions();
    if (permissions === 'read' || permissions === 'download') {
      sasPermissions.read = true;
    } else if (permissions === 'write' || permissions === 'upload') {
      sasPermissions.write = true;
      sasPermissions.create = true;
    } else {
      // Default to read permissions
      sasPermissions.read = true;
    }

    const sasOptions = {
      containerName: this.containerName,
      blobName,
      permissions: sasPermissions,
      startsOn: start,
      expiresOn: expiry,
    };

    const accountSasUrl = generateBlobSASQueryParameters(
      sasOptions,
      new StorageSharedKeyCredential(this.accountName, this.accountKey)
    );

    return accountSasUrl.toString();
  }
}

module.exports = { AzureStorage };
