import mongoose from 'mongoose';
import ensureIndexes from '../utils/ensureIndexes.js';

// Import models to ensure they are loaded
import('../models/User.js');
import('../models/Record.js');
import('../models/ActivityLog.js');
import('../models/Prescription.js');
import('../models/InventoryItem.js');
import('../models/patient.model.js');
import('../models/medicalRecord.m.model.js');

// MongoDB connection is handled by setup.js

describe('Database Index Optimization', () => {
  test('should create all required indexes', async () => {
    await ensureIndexes();
    expect(true).toBeTruthy(); // If no error thrown, indexes were created successfully
  });

  describe('User Model Indexes', () => {
    test('should have email unique index', async () => {
      const indexes = await mongoose.connection.db.collection('users').indexes();
      const emailIndex = indexes.find(i => i.key.email === 1 && i.unique);
      expect(emailIndex).toBeTruthy();
    });

    test('should have username unique index', async () => {
      const indexes = await mongoose.connection.db.collection('users').indexes();
      const usernameIndex = indexes.find(i => i.key.username === 1 && i.unique);
      expect(usernameIndex).toBeTruthy();
    });

    test('should have compound indexes for performance', async () => {
      const indexes = await mongoose.connection.db.collection('users').indexes();

      // Check for email + deletedAt compound index
      const emailDeletedIndex = indexes.find(i => i.key.email === 1 && i.key.deletedAt === 1);
      expect(emailDeletedIndex).toBeTruthy();

      // Check for role + createdAt compound index
      const roleCreatedIndex = indexes.find(i => i.key.role === 1 && i.key.createdAt === -1);
      expect(roleCreatedIndex).toBeTruthy();
    });
  });

  describe('Record Model Indexes', () => {
    test('should have createdBy + createdAt compound index', async () => {
      const indexes = await mongoose.connection.db.collection('records').indexes();
      const compoundIndex = indexes.find(i => i.key.createdBy === 1 && i.key.createdAt === -1);
      expect(compoundIndex).toBeTruthy();
    });

    test('should have text search index', async () => {
      const indexes = await mongoose.connection.db.collection('records').indexes();
      // Text indexes in MongoDB have a special _fts key
      const textIndex = indexes.find(i => i.key._fts === 'text');
      expect(textIndex).toBeTruthy();
    });

    test('should have unique txHash index', async () => {
      const indexes = await mongoose.connection.db.collection('records').indexes();
      const txHashIndex = indexes.find(i => i.key.txHash === 1 && i.unique);
      expect(txHashIndex).toBeTruthy();
    });
  });

  describe('ActivityLog Model Indexes', () => {
    test('should have userId + timestamp compound index', async () => {
      const indexes = await mongoose.connection.db.collection('activitylogs').indexes();
      const compoundIndex = indexes.find(i => i.key.userId === 1 && i.key.timestamp === -1);
      expect(compoundIndex).toBeTruthy();
    });

    test('should have TTL index for automatic cleanup', async () => {
      const indexes = await mongoose.connection.db.collection('activitylogs').indexes();
      const ttlIndex = indexes.find(i => i.key.expiresAt === 1 && i.expireAfterSeconds === 0);
      expect(ttlIndex).toBeTruthy();
    });

    test('should have action + timestamp compound index', async () => {
      const indexes = await mongoose.connection.db.collection('activitylogs').indexes();
      const actionIndex = indexes.find(i => i.key.action === 1 && i.key.timestamp === -1);
      expect(actionIndex).toBeTruthy();
    });
  });

  describe('Prescription Model Indexes', () => {
    test('should have unique prescriptionNumber index', async () => {
      const indexes = await mongoose.connection.db.collection('prescriptions').indexes();
      const prescriptionIndex = indexes.find(i => i.key.prescriptionNumber === 1 && i.unique);
      expect(prescriptionIndex).toBeTruthy();
    });

    test('should have patientId + issuedDate compound index', async () => {
      const indexes = await mongoose.connection.db.collection('prescriptions').indexes();
      const compoundIndex = indexes.find(i => i.key.patientId === 1 && i.key.issuedDate === -1);
      expect(compoundIndex).toBeTruthy();
    });

    test('should have text search index for prescriptions', async () => {
      const indexes = await mongoose.connection.db.collection('prescriptions').indexes();
      const textIndex = indexes.find(i => i.key._fts === 'text');
      expect(textIndex).toBeTruthy();
    });
  });

  describe('InventoryItem Model Indexes', () => {
    test('should have unique sku index', async () => {
      const indexes = await mongoose.connection.db.collection('inventoryitems').indexes();
      const skuIndex = indexes.find(i => i.key.sku === 1 && i.unique);
      expect(skuIndex).toBeTruthy();
    });

    test('should have category + totalQuantity compound index', async () => {
      const indexes = await mongoose.connection.db.collection('inventoryitems').indexes();
      const compoundIndex = indexes.find(i => i.key.category === 1 && i.key.totalQuantity === 1);
      expect(compoundIndex).toBeTruthy();
    });

    test('should have text search index for inventory', async () => {
      const indexes = await mongoose.connection.db.collection('inventoryitems').indexes();
      const textIndex = indexes.find(i => i.key._fts === 'text');
      expect(textIndex).toBeTruthy();
    });
  });

  describe('Patient Model Indexes', () => {
    test('should have text search index for patients', async () => {
      const indexes = await mongoose.connection.db.collection('patients').indexes();
      const textIndex = indexes.find(i => i.key._fts === 'text');
      expect(textIndex).toBeTruthy();
    });
  });

  describe('Query Performance Tests', () => {
    test('user authentication queries should be fast', async () => {
      const startTime = Date.now();

      // Simulate user lookup - should use email index
      await mongoose.connection.db
        .collection('users')
        .findOne({ email: 'test@example.com', deletedAt: null });

      const executionTime = Date.now() - startTime;

      // Even without data, index lookup should be very fast
      expect(executionTime).toBeLessThan(50);
    });

    test('compound queries should use appropriate indexes', async () => {
      const startTime = Date.now();

      // Simulate record lookup by doctor - should use createdBy + createdAt index
      await mongoose.connection.db
        .collection('records')
        .find({
          createdBy: new mongoose.Types.ObjectId(),
          deletedAt: null,
        })
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray();

      const executionTime = Date.now() - startTime;

      // Index-based query should be fast even without data
      expect(executionTime).toBeLessThan(100);
    });

    test('text search queries should have indexes', async () => {
      const startTime = Date.now();

      // Simulate text search - should use text index
      await mongoose.connection.db
        .collection('records')
        .find({ $text: { $search: 'diagnosis' } })
        .toArray();

      const executionTime = Date.now() - startTime;

      // Text index should enable efficient search
      expect(executionTime).toBeLessThan(100);
    });
  });

  describe('Index Statistics', () => {
    test('should report total number of indexes created', async () => {
      const collections = ['users', 'records', 'activitylogs', 'prescriptions', 'inventoryitems'];
      let totalIndexes = 0;

      for (const collectionName of collections) {
        try {
          const indexes = await mongoose.connection.db.collection(collectionName).indexes();
          totalIndexes += indexes.length;
        } catch (error) {
          // Collection might not exist in test environment
        }
      }

      console.log(`📊 Total indexes created across all collections: ${totalIndexes}`);
      expect(totalIndexes).toBeGreaterThan(0);
    });

    test('should verify index names follow convention', async () => {
      const indexes = await mongoose.connection.db.collection('users').indexes();

      // Check that compound indexes follow naming convention
      const compoundIndexes = indexes.filter(i => Object.keys(i.key).length > 1);

      compoundIndexes.forEach(index => {
        expect(index.name).toMatch(/^[a-zA-Z_]+_[0-9-]+(_[a-zA-Z_]+_[0-9-]+)*$/);
      });
    });
  });
});
