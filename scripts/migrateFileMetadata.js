/**
 * Migration script for FileMetadata model
 * This script ensures the FileMetadata collection has proper indexes
 */

require('dotenv').config();
const mongoose = require('mongoose');
const FileMetadata = require('../src/models/FileMetadata');

async function runMigration() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/uzima';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Ensure indexes are created
    console.log('Creating indexes for FileMetadata...');
    await FileMetadata.ensureIndexes();
    console.log('Indexes created successfully');

    // Test the model by creating a sample record
    console.log('Testing FileMetadata model...');
    const sampleRecord = new FileMetadata({
      key: 'test/migration-test.txt',
      filename: 'migration-test.txt',
      mimeType: 'text/plain',
      size: 12,
      uploadedBy: 'migration-test',
      storageType: 'local',
      storagePath: 'test/migration-test.txt',
    });

    await sampleRecord.save();
    console.log('Sample record created successfully');

    // Clean up the test record
    await FileMetadata.deleteOne({ key: 'test/migration-test.txt' });
    console.log('Test record cleaned up');

    console.log('FileMetadata migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };
