import mongoose from 'mongoose';

async function ensureIndexes() {
  const models = mongoose.models;
  const tasks = [];

  // User model indexes
  if (models.User) {
    tasks.push(
      models.User.collection.createIndex({ email: 1 }, { unique: true }),
      models.User.collection.createIndex({ username: 1 }, { unique: true }),
      models.User.collection.createIndex({ email: 1, deletedAt: 1 }),
      models.User.collection.createIndex({ username: 1, deletedAt: 1 }),
      models.User.collection.createIndex({ role: 1, createdAt: -1 }),
      models.User.collection.createIndex({ createdAt: -1 }),
      models.User.collection.createIndex({ deletedAt: 1 })
    );
  }

  // Record model indexes
  if (models.Record) {
    tasks.push(
      models.Record.collection.createIndex({ clientUUID: 1, syncTimestamp: 1 }, { unique: true }),
      models.Record.collection.createIndex({ deletedAt: 1 }),
      models.Record.collection.createIndex({ createdBy: 1, createdAt: -1 }),
      models.Record.collection.createIndex({ patientName: 1, createdAt: -1 }),
      models.Record.collection.createIndex({ txHash: 1 }, { unique: true }),
      models.Record.collection.createIndex({
        patientName: 'text',
        diagnosis: 'text',
        treatment: 'text',
      })
    );
  }

  // ActivityLog model indexes
  if (models.ActivityLog) {
    tasks.push(
      models.ActivityLog.collection.createIndex({ userId: 1, timestamp: -1 }),
      models.ActivityLog.collection.createIndex({ action: 1, timestamp: -1 }),
      models.ActivityLog.collection.createIndex({ userId: 1, action: 1, timestamp: -1 }),
      models.ActivityLog.collection.createIndex({ resourceType: 1, resourceId: 1, timestamp: -1 }),
      models.ActivityLog.collection.createIndex({ result: 1, timestamp: -1 }),
      models.ActivityLog.collection.createIndex({ sessionId: 1, timestamp: -1 }),
      models.ActivityLog.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    );
  }

  // Prescription model indexes
  if (models.Prescription) {
    tasks.push(
      models.Prescription.collection.createIndex({ prescriptionNumber: 1 }, { unique: true }),
      models.Prescription.collection.createIndex({ patientId: 1 }),
      models.Prescription.collection.createIndex({ doctorId: 1 }),
      models.Prescription.collection.createIndex({ issuedDate: 1 }),
      models.Prescription.collection.createIndex({ expiryDate: 1 }),
      models.Prescription.collection.createIndex({ status: 1 }),
      models.Prescription.collection.createIndex({ patientId: 1, issuedDate: -1 }),
      models.Prescription.collection.createIndex({ doctorId: 1, issuedDate: -1 }),
      models.Prescription.collection.createIndex({ status: 1, expiryDate: 1 }),
      models.Prescription.collection.createIndex({ signature: 1 }),
      models.Prescription.collection.createIndex({
        patientName: 'text',
        doctorName: 'text',
        'medications.name': 'text',
        instructions: 'text',
      })
    );
  }

  // InventoryItem model indexes
  if (models.InventoryItem) {
    tasks.push(
      models.InventoryItem.collection.createIndex({ sku: 1 }, { unique: true }),
      models.InventoryItem.collection.createIndex({ name: 1 }),
      models.InventoryItem.collection.createIndex({ category: 1, totalQuantity: 1 }),
      models.InventoryItem.collection.createIndex({ totalQuantity: 1, threshold: 1 }),
      models.InventoryItem.collection.createIndex({
        name: 'text',
        category: 'text',
        sku: 'text',
      })
    );
  }

  // Patient model indexes
  if (models.Patient) {
    tasks.push(
      models.Patient.collection.createIndex({
        firstName: 'text',
        lastName: 'text',
        email: 'text',
        address: 'text',
      })
    );
  }

  // MedicalRecord model indexes
  if (models.MedicalRecord) {
    tasks.push(
      models.MedicalRecord.collection.createIndex({ patientId: 1, createdAt: -1 }),
      models.MedicalRecord.collection.createIndex({
        diagnosis: 'text',
        treatment: 'text',
        notes: 'text',
      })
    );
  }

  // TransactionLog model indexes
  if (models.TransactionLog) {
    tasks.push(
      models.TransactionLog.collection.createIndex({ action: 1 }),
      models.TransactionLog.collection.createIndex({ resource: 1 }),
      models.TransactionLog.collection.createIndex({ userId: 1 }),
      models.TransactionLog.collection.createIndex({ timestamp: 1 }),
      models.TransactionLog.collection.createIndex({ action: 1, resource: 1, timestamp: -1 })
    );
  }

  await Promise.allSettled(tasks);
  console.log('✅ Database index optimization complete.');
  console.log(`📊 Total indexes created/verified: ${tasks.length}`);
}

export default ensureIndexes;
