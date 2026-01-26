const crypto = require('crypto');
const { StorageServiceManager } = require('./StorageServiceManager');

class FileService {
  constructor() {
    this.storageManager = new StorageServiceManager();
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

    // Generate presigned URL using the abstraction layer
    const uploadUrl = await this.storageManager.generatePresignedUrl(key, {
      expiresIn: this.uploadTTL,
      operation: 'upload'
    });

    return {
      uploadUrl,
      key,
      expiresIn: this.uploadTTL,
    };
  }

  async generateSignedDownloadUrl(key) {
    // Generate presigned URL using the abstraction layer
    const signedUrl = await this.storageManager.generatePresignedUrl(key, {
      expiresIn: this.downloadTTL,
      operation: 'read'
    });

    return signedUrl;
  }

  async deleteFile(key) {
    // Delete using the abstraction layer
    await this.storageManager.delete(key);
  }

  async moveToQuarantine(key) {
    const quarantineKey = key.replace('users/', 'quarantine/');
    
    // Get the file data from current location
    const fileData = await this.storageManager.download(key);
    
    // Upload to quarantine location
    const metadata = await this.storageManager.upload(fileData, 'quarantine-file', 'system', {
      originalFilename: quarantineKey.split('/').pop()
    });
    
    // Delete the original file
    await this.storageManager.delete(key);
    
    return quarantineKey;
  }
}

module.exports = new FileService();
