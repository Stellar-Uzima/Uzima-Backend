/**
 * Tests for the softDeletePlugin Mongoose plugin
 * Tests the plugin functionality in isolation
 */
import mongoose from 'mongoose';
import softDeletePlugin from '../models/plugins/softDeletePlugin.js';

// Create a test schema with the plugin
const testSchema = new mongoose.Schema({
  name: { type: String, required: true },
  value: { type: Number, default: 0 },
});
testSchema.plugin(softDeletePlugin);

// Only create the model if it doesn't already exist
const TestModel =
  mongoose.models.SoftDeleteTestModel || mongoose.model('SoftDeleteTestModel', testSchema);

describe('softDeletePlugin', () => {
  beforeEach(async () => {
    // Clean up test data
    await TestModel.deleteMany({});
  });

  afterAll(async () => {
    await TestModel.deleteMany({});
  });

  describe('Schema modifications', () => {
    it('should add deletedAt and deletedBy fields', () => {
      const paths = TestModel.schema.paths;
      expect(paths.deletedAt).toBeDefined();
      expect(paths.deletedBy).toBeDefined();
    });

    it('should have deletedAt as Date type with default null', () => {
      const deletedAtPath = TestModel.schema.paths.deletedAt;
      expect(deletedAtPath.instance).toBe('Date');
    });

    it('should have deletedBy as ObjectId with ref to User', () => {
      const deletedByPath = TestModel.schema.paths.deletedBy;
      expect(deletedByPath.instance).toBe('ObjectId');
      expect(deletedByPath.options.ref).toBe('User');
    });
  });

  describe('Instance methods', () => {
    it('should soft delete a document using softDelete()', async () => {
      const doc = await TestModel.create({ name: 'Test Item' });
      expect(doc.deletedAt).toBeNull();

      await doc.softDelete();

      expect(doc.deletedAt).not.toBeNull();
      expect(doc.deletedAt).toBeInstanceOf(Date);
    });

    it('should set deletedBy when provided', async () => {
      const doc = await TestModel.create({ name: 'Test Item' });
      const userId = new mongoose.Types.ObjectId();

      await doc.softDelete(userId);

      expect(doc.deletedBy.toString()).toBe(userId.toString());
    });

    it('should restore a soft-deleted document using restore()', async () => {
      const doc = await TestModel.create({ name: 'Test Item' });
      await doc.softDelete();
      expect(doc.deletedAt).not.toBeNull();

      await doc.restore();

      expect(doc.deletedAt).toBeNull();
      expect(doc.deletedBy).toBeNull();
    });

    it('should return correct value for isDeleted()', async () => {
      const doc = await TestModel.create({ name: 'Test Item' });
      expect(doc.isDeleted()).toBe(false);

      await doc.softDelete();
      expect(doc.isDeleted()).toBe(true);

      await doc.restore();
      expect(doc.isDeleted()).toBe(false);
    });
  });

  describe('Query filtering', () => {
    beforeEach(async () => {
      // Create 3 items: 2 active, 1 soft-deleted
      await TestModel.create({ name: 'Active 1' });
      await TestModel.create({ name: 'Active 2' });
      const deleted = await TestModel.create({ name: 'Deleted' });
      await deleted.softDelete();
    });

    it('should filter out soft-deleted documents by default in find()', async () => {
      const results = await TestModel.find({});
      expect(results.length).toBe(2);
      expect(results.every(r => r.name !== 'Deleted')).toBe(true);
    });

    it('should filter out soft-deleted documents in findOne()', async () => {
      const result = await TestModel.findOne({ name: 'Deleted' });
      expect(result).toBeNull();
    });

    it('should filter out soft-deleted documents in countDocuments()', async () => {
      const count = await TestModel.countDocuments({});
      expect(count).toBe(2);
    });

    it('should include soft-deleted documents when deletedAt is explicitly queried', async () => {
      const results = await TestModel.find({ deletedAt: { $ne: null } });
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Deleted');
    });
  });

  describe('Static methods', () => {
    beforeEach(async () => {
      await TestModel.create({ name: 'Active 1' });
      await TestModel.create({ name: 'Active 2' });
      const deleted = await TestModel.create({ name: 'Deleted' });
      await deleted.softDelete();
    });

    it('should find only deleted documents with findDeleted()', async () => {
      const results = await TestModel.findDeleted({});
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Deleted');
    });

    it('should find all documents with findWithDeleted()', async () => {
      const results = await TestModel.findWithDeleted({});
      expect(results.length).toBe(3);
    });

    it('should find one deleted document with findOneDeleted()', async () => {
      const result = await TestModel.findOneDeleted({ name: 'Deleted' });
      expect(result).not.toBeNull();
      expect(result.name).toBe('Deleted');
    });

    it('should find one including deleted with findOneWithDeleted()', async () => {
      const result = await TestModel.findOneWithDeleted({ name: 'Deleted' });
      expect(result).not.toBeNull();
    });

    it('should restore by ID with restoreById()', async () => {
      const deleted = await TestModel.findOneDeleted({ name: 'Deleted' });

      await TestModel.restoreById(deleted._id);

      const restored = await TestModel.findById(deleted._id);
      expect(restored).not.toBeNull();
      expect(restored.deletedAt).toBeNull();
    });

    it('should return null when restoreById() called on non-deleted document', async () => {
      const active = await TestModel.findOne({ name: 'Active 1' });
      const result = await TestModel.restoreById(active._id);
      expect(result).toBeNull();
    });

    it('should soft delete by ID with softDeleteById()', async () => {
      const active = await TestModel.findOne({ name: 'Active 1' });

      await TestModel.softDeleteById(active._id);

      const deleted = await TestModel.findOneDeleted({ _id: active._id });
      expect(deleted).not.toBeNull();
      expect(deleted.deletedAt).not.toBeNull();
    });

    it('should count non-deleted with countNonDeleted()', async () => {
      const count = await TestModel.countNonDeleted({});
      expect(count).toBe(2);
    });

    it('should count deleted with countDeleted()', async () => {
      const count = await TestModel.countDeleted({});
      expect(count).toBe(1);
    });
  });

  describe('purgeOlderThan', () => {
    it('should permanently delete items older than retention period', async () => {
      // Create an item that was "deleted" 35 days ago
      const oldDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
      const doc = await TestModel.create({ name: 'Old Deleted' });
      doc.deletedAt = oldDate;
      await doc.save();

      // Create an item that was "deleted" 5 days ago
      const recentDoc = await TestModel.create({ name: 'Recent Deleted' });
      recentDoc.deletedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      await recentDoc.save();

      // Purge items older than 30 days
      const result = await TestModel.purgeOlderThan(30);

      expect(result.deletedCount).toBe(1);

      // Old one should be gone
      const oldDeleted = await TestModel.findOneWithDeleted({ name: 'Old Deleted' });
      expect(oldDeleted).toBeNull();

      // Recent one should still exist
      const recentDeleted = await TestModel.findOneWithDeleted({ name: 'Recent Deleted' });
      expect(recentDeleted).not.toBeNull();
    });
  });
});
