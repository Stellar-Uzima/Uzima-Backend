const { LocalStorage } = require('./LocalStorage');
const { S3Storage } = require('./S3Storage');
const { AzureStorage } = require('./AzureStorage');

class StorageFactory {
  static createStorage(type, options = {}) {
    const storageType = type || process.env.STORAGE_TYPE || 'local';

    switch (storageType.toLowerCase()) {
      case 'local':
        return new LocalStorage(options);
      case 's3':
      case 'aws':
        return new S3Storage(options);
      case 'azure':
      case 'azureblob':
        return new AzureStorage(options);
      default:
        throw new Error(`Unsupported storage type: ${storageType}. Supported types: local, s3, azure`);
    }
  }

  static getSupportedTypes() {
    return ['local', 's3', 'azure'];
  }

  static getCurrentStorageType() {
    return process.env.STORAGE_TYPE || 'local';
  }

  static isStorageTypeValid(type) {
    return this.getSupportedTypes().includes(type.toLowerCase());
  }
}

module.exports = { StorageFactory };