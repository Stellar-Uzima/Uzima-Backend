const { StorageServiceManager } = require('../services/StorageServiceManager');
const FileMetadata = require('../models/FileMetadata');

// Mock the FileMetadata model
jest.mock('../models/FileMetadata');

describe('StorageServiceManager', () => {
  let storageServiceManager;

  beforeEach(() => {
    // Set environment to use local storage for testing
    process.env.STORAGE_TYPE = 'local';
    storageServiceManager = new StorageServiceManager();

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('upload', () => {
    test('should upload file and save metadata', async () => {
      // Mock the storage upload method
      const mockUploadResult = {
        key: 'users/test-user/12345-test-file.txt',
        filename: 'test-file.txt',
        mimeType: 'text/plain',
        size: 13,
        uploadedBy: 'test-user',
        additionalMetadata: {},
      };

      storageServiceManager.storage.upload = jest.fn().mockResolvedValue(mockUploadResult);

      // Mock the FileMetadata save method
      const mockSave = jest.fn().mockResolvedValue(mockUploadResult);
      FileMetadata.mockImplementation(function () {
        this.save = mockSave;
        Object.assign(this, mockUploadResult);
      });
      FileMetadata.updateOne = jest.fn().mockResolvedValue({ nModified: 1 });

      const result = await storageServiceManager.upload(
        Buffer.from('Hello, World!'),
        'test-file.txt',
        'test-user',
        { tags: ['test'] }
      );

      expect(storageServiceManager.storage.upload).toHaveBeenCalledWith(
        Buffer.from('Hello, World!'),
        expect.stringContaining('users/test-user/'),
        {
          userId: 'test-user',
          originalFilename: 'test-file.txt',
          tags: ['test'],
        }
      );

      expect(result).toHaveProperty('databaseId');
      expect(result).toHaveProperty('key');
    });
  });

  describe('download', () => {
    test('should download file from storage', async () => {
      const mockFileData = Buffer.from('Hello, World!');
      storageServiceManager.storage.download = jest.fn().mockResolvedValue(mockFileData);

      const result = await storageServiceManager.download('test-key');

      expect(storageServiceManager.storage.download).toHaveBeenCalledWith('test-key');
      expect(result).toEqual(mockFileData);
    });
  });

  describe('delete', () => {
    test('should delete file from storage and database', async () => {
      storageServiceManager.storage.delete = jest.fn().mockResolvedValue(undefined);
      FileMetadata.deleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 });

      await storageServiceManager.delete('test-key');

      expect(storageServiceManager.storage.delete).toHaveBeenCalledWith('test-key');
      expect(FileMetadata.deleteOne).toHaveBeenCalledWith({ key: 'test-key' });
    });
  });

  describe('exists', () => {
    test('should check if file exists', async () => {
      storageServiceManager.storage.exists = jest.fn().mockResolvedValue(true);

      const result = await storageServiceManager.exists('test-key');

      expect(storageServiceManager.storage.exists).toHaveBeenCalledWith('test-key');
      expect(result).toBe(true);
    });
  });

  describe('generatePresignedUrl', () => {
    test('should generate presigned URL', async () => {
      const mockUrl = 'https://example.com/presigned-url';
      storageServiceManager.storage.generatePresignedUrl = jest.fn().mockResolvedValue(mockUrl);

      const result = await storageServiceManager.generatePresignedUrl('test-key', {
        expiresIn: 3600,
      });

      expect(storageServiceManager.storage.generatePresignedUrl).toHaveBeenCalledWith('test-key', {
        expiresIn: 3600,
      });
      expect(result).toBe(mockUrl);
    });
  });

  describe('getFileMetadata', () => {
    test('should get file metadata from storage', async () => {
      const mockStorageMetadata = {
        key: 'test-key',
        filename: 'test-file.txt',
        mimeType: 'text/plain',
        size: 13,
        uploadedBy: 'test-user',
      };

      storageServiceManager.storage.getFileMetadata = jest
        .fn()
        .mockResolvedValue(mockStorageMetadata);
      FileMetadata.findOne = jest.fn().mockResolvedValue(null); // No DB record

      const result = await storageServiceManager.getFileMetadata('test-key');

      expect(storageServiceManager.storage.getFileMetadata).toHaveBeenCalledWith('test-key');
      expect(result).toEqual(mockStorageMetadata);
    });
  });

  describe('generateFileKey', () => {
    test('should generate a file key with user ID and timestamp', () => {
      const originalRandomBytes = require('crypto').randomBytes;
      require('crypto').randomBytes = jest.fn().mockReturnValue(Buffer.from('abcd1234'));

      const key = storageServiceManager.generateFileKey('user123', 'test.txt');

      expect(key).toMatch(/^users\/user123\/\d+-abcd1234-test\.txt$/);

      // Restore original function
      require('crypto').randomBytes = originalRandomBytes;
    });
  });
});
