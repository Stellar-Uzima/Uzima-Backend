/**
 * StorageService Interface
 * Defines the contract for file storage implementations
 */

/**
 * File metadata object
 * @typedef {Object} FileMetadata
 * @property {string} key - Unique identifier for the file
 * @property {string} filename - Original filename
 * @property {string} mimeType - MIME type of the file
 * @property {number} size - Size of the file in bytes
 * @property {string} uploadedBy - ID of user who uploaded the file
 * @property {Date} uploadedAt - Timestamp when file was uploaded
 * @property {Object} [additionalMetadata] - Additional metadata specific to the storage backend
 */

/**
 * StorageService interface
 */
class StorageService {
  /**
   * Upload a file to storage
   * @param {Buffer|ReadableStream|string} fileData - The file data to upload
   * @param {string} key - The key/filename to store the file under
   * @param {Object} options - Additional options for upload
   * @param {string} [options.contentType] - MIME type of the file
   * @param {string} [options.userId] - ID of the user uploading the file
   * @returns {Promise<FileMetadata>} Promise resolving to file metadata
   */
  async upload(fileData, key, options = {}) {
    throw new Error('Method upload must be implemented');
  }

  /**
   * Download a file from storage
   * @param {string} key - The key of the file to download
   * @returns {Promise<Buffer|ReadableStream>} Promise resolving to file data
   */
  async download(key) {
    throw new Error('Method download must be implemented');
  }

  /**
   * Delete a file from storage
   * @param {string} key - The key of the file to delete
   * @returns {Promise<void>} Promise resolving when file is deleted
   */
  async delete(key) {
    throw new Error('Method delete must be implemented');
  }

  /**
   * List files in storage
   * @param {string} prefix - Optional prefix to filter files by
   * @param {Object} options - Additional options for listing
   * @returns {Promise<Array<FileMetadata>>} Promise resolving to array of file metadata
   */
  async list(prefix = '', options = {}) {
    throw new Error('Method list must be implemented');
  }

  /**
   * Check if a file exists in storage
   * @param {string} key - The key of the file to check
   * @returns {Promise<boolean>} Promise resolving to true if file exists
   */
  async exists(key) {
    throw new Error('Method exists must be implemented');
  }

  /**
   * Generate a presigned URL for file access
   * @param {string} key - The key of the file
   * @param {Object} options - Options for URL generation
   * @param {number} [options.expiresIn] - Expiration time in seconds (default: 3600)
   * @param {string} [options.operation] - Operation type: 'read' or 'write' (default: 'read')
   * @returns {Promise<string>} Promise resolving to presigned URL
   */
  async generatePresignedUrl(key, options = {}) {
    throw new Error('Method generatePresignedUrl must be implemented');
  }

  /**
   * Get metadata for a specific file
   * @param {string} key - The key of the file
   * @returns {Promise<FileMetadata>} Promise resolving to file metadata
   */
  async getFileMetadata(key) {
    throw new Error('Method getFileMetadata must be implemented');
  }
}

module.exports = { StorageService };