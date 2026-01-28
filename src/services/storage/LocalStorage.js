const fs = require('fs').promises;
const path = require('path');
const { StorageService } = require('./StorageService');

class LocalStorage extends StorageService {
  constructor(options = {}) {
    super();
    this.storagePath = options.storagePath || path.join(process.cwd(), 'uploads');
    this.baseUrl = options.baseUrl || '/uploads';
  }

  async init() {
    // Ensure storage directory exists
    try {
      await fs.access(this.storagePath);
    } catch (error) {
      await fs.mkdir(this.storagePath, { recursive: true });
    }
  }

  async upload(fileData, key, options = {}) {
    await this.init(); // Ensure directory exists

    const filePath = path.join(this.storagePath, key);
    const dirPath = path.dirname(filePath);

    // Ensure directory exists
    await fs.mkdir(dirPath, { recursive: true });

    // Write file data
    if (Buffer.isBuffer(fileData)) {
      await fs.writeFile(filePath, fileData);
    } else if (typeof fileData === 'string') {
      await fs.writeFile(filePath, fileData);
    } else {
      // Assume it's a stream
      const chunks = [];
      for await (const chunk of fileData) {
        chunks.push(chunk);
      }
      await fs.writeFile(filePath, Buffer.concat(chunks));
    }

    // Get file stats
    const stats = await fs.stat(filePath);

    // Create metadata
    const fileMetadata = {
      key,
      filename: path.basename(key),
      mimeType: options.contentType || 'application/octet-stream',
      size: stats.size,
      uploadedBy: options.userId || 'system',
      uploadedAt: new Date(),
      additionalMetadata: {
        localPath: filePath,
        mtime: stats.mtime,
        atime: stats.atime,
      },
    };

    return fileMetadata;
  }

  async download(key) {
    const filePath = path.join(this.storagePath, key);

    try {
      const fileBuffer = await fs.readFile(filePath);
      return fileBuffer;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${key}`);
      }
      throw error;
    }
  }

  async delete(key) {
    const filePath = path.join(this.storagePath, key);

    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, treat as success
        return;
      }
      throw error;
    }
  }

  async list(prefix = '', options = {}) {
    await this.init(); // Ensure directory exists

    const searchPath = prefix ? path.join(this.storagePath, prefix) : this.storagePath;

    try {
      const entries = await fs.readdir(searchPath, { withFileTypes: true });
      const files = [];

      for (const entry of entries) {
        const fullPath = path.join(searchPath, entry.name);
        const relativePath = path.relative(this.storagePath, fullPath);

        if (entry.isFile()) {
          const stats = await fs.stat(fullPath);

          files.push({
            key: relativePath,
            filename: entry.name,
            mimeType: this.getMimeType(entry.name),
            size: stats.size,
            uploadedBy: 'system', // Local storage doesn't track uploader
            uploadedAt: stats.birthtime,
            additionalMetadata: {
              localPath: fullPath,
              mtime: stats.mtime,
              atime: stats.atime,
            },
          });
        } else if (entry.isDirectory() && options.recursive) {
          // Recursively list subdirectory if requested
          const subFiles = await this.list(relativePath, options);
          files.push(...subFiles);
        }
      }

      return files;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return []; // Directory doesn't exist, return empty array
      }
      throw error;
    }
  }

  async exists(key) {
    const filePath = path.join(this.storagePath, key);

    try {
      await fs.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  async generatePresignedUrl(key, options = {}) {
    // For local storage, return a direct URL since we don't have true presigned URLs
    // This is a simplified approach - in a real application, you might want to implement
    // proper authentication for accessing files
    const expiresIn = options.expiresIn || 3600; // 1 hour default

    // Note: This is not a true presigned URL as local storage doesn't support expiration
    // This would need to be handled by the application layer with proper authentication
    return `${this.baseUrl}/${key}`;
  }

  async getFileMetadata(key) {
    const filePath = path.join(this.storagePath, key);

    try {
      const stats = await fs.stat(filePath);

      return {
        key,
        filename: path.basename(key),
        mimeType: this.getMimeType(key),
        size: stats.size,
        uploadedBy: 'system', // Local storage doesn't track uploader
        uploadedAt: stats.birthtime,
        additionalMetadata: {
          localPath: filePath,
          mtime: stats.mtime,
          atime: stats.atime,
        },
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${key}`);
      }
      throw error;
    }
  }

  getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.txt': 'text/plain',
      '.html': 'text/html',
      '.htm': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }
}

module.exports = { LocalStorage };
