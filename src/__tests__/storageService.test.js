const { StorageFactory } = require('../services/storage/StorageFactory');
const { StorageService } = require('../services/storage/StorageService');

describe('StorageService Abstraction Layer', () => {
  let storageService;
  const testFileKey = 'test/test-file.txt';
  const testFileContent = 'Hello, World!';
  const userId = 'test-user-123';

  beforeEach(() => {
    // Set environment to use local storage for testing
    process.env.STORAGE_TYPE = 'local';
    storageService = StorageFactory.createStorage();
  });

  afterEach(async () => {
    // Clean up test file if it exists
    try {
      await storageService.delete(testFileKey);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('LocalStorage Adapter', () => {
    beforeAll(() => {
      process.env.STORAGE_TYPE = 'local';
      storageService = StorageFactory.createStorage();
    });

    test('should upload a file', async () => {
      const metadata = await storageService.upload(
        Buffer.from(testFileContent),
        testFileKey,
        { userId, contentType: 'text/plain' }
      );

      expect(metadata).toHaveProperty('key');
      expect(metadata.key).toBe(testFileKey);
      expect(metadata.filename).toBe('test-file.txt');
      expect(metadata.size).toBe(testFileContent.length);
      expect(metadata.uploadedBy).toBe(userId);
      expect(metadata.mimeType).toBe('text/plain');
    });

    test('should download a file', async () => {
      // First upload the file
      await storageService.upload(
        Buffer.from(testFileContent),
        testFileKey,
        { userId, contentType: 'text/plain' }
      );

      // Then download it
      const downloadedData = await storageService.download(testFileKey);
      expect(downloadedData.toString()).toBe(testFileContent);
    });

    test('should check if file exists', async () => {
      // Upload file first
      await storageService.upload(
        Buffer.from(testFileContent),
        testFileKey,
        { userId, contentType: 'text/plain' }
      );

      // Check if it exists
      const exists = await storageService.exists(testFileKey);
      expect(exists).toBe(true);

      // Check for non-existent file
      const notExists = await storageService.exists('non-existent-file.txt');
      expect(notExists).toBe(false);
    });

    test('should delete a file', async () => {
      // Upload file first
      await storageService.upload(
        Buffer.from(testFileContent),
        testFileKey,
        { userId, contentType: 'text/plain' }
      );

      // Verify it exists
      let exists = await storageService.exists(testFileKey);
      expect(exists).toBe(true);

      // Delete the file
      await storageService.delete(testFileKey);

      // Verify it no longer exists
      exists = await storageService.exists(testFileKey);
      expect(exists).toBe(false);
    });

    test('should get file metadata', async () => {
      await storageService.upload(
        Buffer.from(testFileContent),
        testFileKey,
        { userId, contentType: 'text/plain' }
      );

      const metadata = await storageService.getFileMetadata(testFileKey);
      expect(metadata.key).toBe(testFileKey);
      expect(metadata.filename).toBe('test-file.txt');
      expect(metadata.size).toBe(testFileContent.length);
      expect(metadata.mimeType).toBe('text/plain');
      expect(metadata.uploadedBy).toBe(userId);
    });

    test('should list files', async () => {
      const prefix = 'test/';
      const file1 = `${prefix}file1.txt`;
      const file2 = `${prefix}file2.txt`;

      // Upload two files
      await storageService.upload(Buffer.from('content1'), file1, { userId });
      await storageService.upload(Buffer.from('content2'), file2, { userId });

      // List files with prefix
      const files = await storageService.list(prefix);
      expect(files.length).toBeGreaterThanOrEqual(2);

      const fileNames = files.map(f => f.filename);
      expect(fileNames).toContain('file1.txt');
      expect(fileNames).toContain('file2.txt');
    });

    test('should generate presigned URL', async () => {
      const url = await storageService.generatePresignedUrl(testFileKey, { expiresIn: 3600 });
      expect(url).toMatch(/^\/uploads\//); // Local storage returns relative path
    });
  });

  describe('StorageFactory', () => {
    test('should create local storage service', () => {
      process.env.STORAGE_TYPE = 'local';
      const service = StorageFactory.createStorage();
      expect(service.constructor.name).toBe('LocalStorage');
    });

    test('should create S3 storage service', () => {
      process.env.STORAGE_TYPE = 's3';
      const service = StorageFactory.createStorage();
      expect(service.constructor.name).toBe('S3Storage');
    });

    test('should create Azure storage service', () => {
      process.env.STORAGE_TYPE = 'azure';
      const service = StorageFactory.createStorage();
      expect(service.constructor.name).toBe('AzureStorage');
    });

    test('should handle case-insensitive storage types', () => {
      const service1 = StorageFactory.createStorage('LOCAL');
      const service2 = StorageFactory.createStorage('S3');
      const service3 = StorageFactory.createStorage('AZURE');

      expect(service1.constructor.name).toBe('LocalStorage');
      expect(service2.constructor.name).toBe('S3Storage');
      expect(service3.constructor.name).toBe('AzureStorage');
    });

    test('should throw error for unsupported storage type', () => {
      expect(() => {
        StorageFactory.createStorage('unsupported-type');
      }).toThrow('Unsupported storage type: unsupported-type');
    });

    test('should validate storage types', () => {
      expect(StorageFactory.isStorageTypeValid('local')).toBe(true);
      expect(StorageFactory.isStorageTypeValid('s3')).toBe(true);
      expect(StorageFactory.isStorageTypeValid('azure')).toBe(true);
      expect(StorageFactory.isStorageTypeValid('invalid')).toBe(false);
    });
  });

  describe('Interface Compliance', () => {
    test('should implement all required methods', () => {
      expect(typeof storageService.upload).toBe('function');
      expect(typeof storageService.download).toBe('function');
      expect(typeof storageService.delete).toBe('function');
      expect(typeof storageService.list).toBe('function');
      expect(typeof storageService.exists).toBe('function');
      expect(typeof storageService.generatePresignedUrl).toBe('function');
      expect(typeof storageService.getFileMetadata).toBe('function');
    });

    test('should throw error for unimplemented methods in base class', () => {
      const baseService = new StorageService();
      
      expect(() => baseService.upload()).rejects.toThrow('Method upload must be implemented');
      expect(() => baseService.download()).rejects.toThrow('Method download must be implemented');
      expect(() => baseService.delete()).rejects.toThrow('Method delete must be implemented');
      expect(() => baseService.list()).rejects.toThrow('Method list must be implemented');
      expect(() => baseService.exists()).rejects.toThrow('Method exists must be implemented');
      expect(() => baseService.generatePresignedUrl()).rejects.toThrow('Method generatePresignedUrl must be implemented');
      expect(() => baseService.getFileMetadata()).rejects.toThrow('Method getFileMetadata must be implemented');
    });
  });
});