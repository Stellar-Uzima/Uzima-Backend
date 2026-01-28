const { StorageFactory } = require('./storage/StorageFactory');
const FileMetadata = require('../models/FileMetadata');

class StorageServiceManager {
  constructor() {
    this.storage = StorageFactory.createStorage();
  }

  async upload(fileData, originalFilename, userId, options = {}) {
    // Generate a unique key for the file
    const key = this.generateFileKey(userId, originalFilename);
    const storageType = process.env.STORAGE_TYPE || 'local';

    // Upload to storage backend
    const fileMetadata = await this.storage.upload(fileData, key, {
      ...options,
      userId: userId.toString(),
      originalFilename,
    });

    // Store metadata in database
    const metadataRecord = new FileMetadata({
      key: fileMetadata.key,
      filename: fileMetadata.filename,
      mimeType: fileMetadata.mimeType,
      size: fileMetadata.size,
      uploadedBy: userId,
      storageType: storageType,
      storagePath: key,
      originalFilename: originalFilename,
      metadata: fileMetadata.additionalMetadata || {},
      tags: options.tags || [],
    });

    await metadataRecord.save();

    return {
      ...fileMetadata,
      id: metadataRecord._id,
      databaseId: metadataRecord._id,
    };
  }

  async download(key) {
    return await this.storage.download(key);
  }

  async delete(key, userId = null) {
    // Optionally verify user ownership before deletion
    if (userId) {
      const metadataRecord = await FileMetadata.findOne({ key });
      if (metadataRecord && metadataRecord.uploadedBy.toString() !== userId.toString()) {
        throw new Error('Unauthorized: Cannot delete file owned by another user');
      }
    }

    // Delete from storage backend
    await this.storage.delete(key);

    // Remove metadata from database
    await FileMetadata.deleteOne({ key });
  }

  async list(userId = null, prefix = '', options = {}) {
    // Get files from storage backend
    const files = await this.storage.list(prefix, options);

    // Enhance with database metadata
    const enhancedFiles = [];
    for (const file of files) {
      const metadataRecord = await FileMetadata.findOne({ key: file.key });
      if (metadataRecord) {
        enhancedFiles.push({
          ...file,
          databaseId: metadataRecord._id,
          tags: metadataRecord.tags,
          isPublic: metadataRecord.isPublic,
          accessCount: metadataRecord.accessCount,
        });
      } else {
        enhancedFiles.push(file);
      }
    }

    // Filter by user if specified
    if (userId) {
      return enhancedFiles.filter(file => {
        // This assumes that file key contains user information
        // Or we can look up from database metadata
        return true; // Simplified - in real implementation, check ownership
      });
    }

    return enhancedFiles;
  }

  async exists(key) {
    return await this.storage.exists(key);
  }

  async generatePresignedUrl(key, options = {}) {
    return await this.storage.generatePresignedUrl(key, options);
  }

  async getFileMetadata(key) {
    // First get from storage backend
    const storageMetadata = await this.storage.getFileMetadata(key);

    // Then enhance with database metadata
    const dbMetadata = await FileMetadata.findOne({ key });

    if (dbMetadata) {
      return {
        ...storageMetadata,
        databaseId: dbMetadata._id,
        tags: dbMetadata.tags,
        isPublic: dbMetadata.isPublic,
        accessCount: dbMetadata.accessCount,
        originalFilename: dbMetadata.originalFilename,
      };
    }

    return storageMetadata;
  }

  async updateFileTags(key, tags, userId = null) {
    // Verify user ownership if userId is provided
    if (userId) {
      const metadataRecord = await FileMetadata.findOne({ key, uploadedBy: userId });
      if (!metadataRecord) {
        throw new Error('Unauthorized: Cannot update tags for file owned by another user');
      }
    }

    // Update tags in database
    const result = await FileMetadata.updateOne({ key }, { $set: { tags, updatedAt: new Date() } });

    return result;
  }

  async incrementAccessCount(key) {
    const result = await FileMetadata.updateOne(
      { key },
      {
        $inc: { accessCount: 1 },
        $set: { lastAccessedAt: new Date() },
      }
    );

    return result;
  }

  generateFileKey(userId, originalFilename) {
    const timestamp = Date.now();
    const random = require('crypto').randomBytes(8).toString('hex');
    const sanitized = originalFilename.replace(/[^a-zA-Z0-9.-]/g, '_');

    // Create a path structure like: user/{userId}/{timestamp}-{random}-{filename}
    return `users/${userId}/${timestamp}-${random}-${sanitized}`;
  }
}

module.exports = { StorageServiceManager };
