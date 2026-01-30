module.exports = {
  async up(db, client) {
    console.log('🚀 Starting database index optimization migration...');

    const operations = [];

    try {
      // User model indexes
      console.log('📊 Creating User model indexes...');
      operations.push(
        db.collection('users').createIndex({ email: 1, deletedAt: 1 }),
        db.collection('users').createIndex({ username: 1, deletedAt: 1 }),
        db.collection('users').createIndex({ role: 1, createdAt: -1 }),
        db.collection('users').createIndex({ createdAt: -1 })
      );

      // Record model indexes
      console.log('📊 Creating Record model indexes...');
      operations.push(
        db.collection('records').createIndex({ createdBy: 1, createdAt: -1 }),
        db.collection('records').createIndex({ patientName: 1, createdAt: -1 }),
        db.collection('records').createIndex({
          patientName: 'text',
          diagnosis: 'text',
          treatment: 'text',
        })
      );

      // Prescription model indexes
      console.log('📊 Creating Prescription model indexes...');
      operations.push(
        db.collection('prescriptions').createIndex({ patientId: 1, issuedDate: -1 }),
        db.collection('prescriptions').createIndex({ doctorId: 1, issuedDate: -1 }),
        db.collection('prescriptions').createIndex({ status: 1, expiryDate: 1 }),
        db.collection('prescriptions').createIndex({ signature: 1 }),
        db.collection('prescriptions').createIndex({
          patientName: 'text',
          doctorName: 'text',
          'medications.name': 'text',
          instructions: 'text',
        })
      );

      // InventoryItem model indexes
      console.log('📊 Creating InventoryItem model indexes...');
      operations.push(
        db.collection('inventoryitems').createIndex({ name: 1 }),
        db.collection('inventoryitems').createIndex({ category: 1, totalQuantity: 1 }),
        db.collection('inventoryitems').createIndex({ totalQuantity: 1, threshold: 1 }),
        db.collection('inventoryitems').createIndex({
          name: 'text',
          category: 'text',
          sku: 'text',
        })
      );

      // MedicalRecord model indexes
      console.log('📊 Creating MedicalRecord model indexes...');
      operations.push(db.collection('medicalrecords').createIndex({ patientId: 1, createdAt: -1 }));

      // Execute all index creation operations
      const results = await Promise.allSettled(operations);

      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failureCount = results.filter(r => r.status === 'rejected').length;

      console.log(
        `✅ Index optimization complete: ${successCount} successful, ${failureCount} failed`
      );

      if (failureCount > 0) {
        const failures = results
          .filter(r => r.status === 'rejected')
          .map(r => r.reason?.message || 'Unknown error');
        console.warn('⚠️ Some indexes failed to create:', failures);
      }
    } catch (error) {
      console.error('❌ Migration encountered an error:', error.message);
      throw error;
    }
  },

  async down(db, client) {
    console.log('🔄 Reversing database index optimization...');

    const operations = [];

    try {
      // Drop User model compound indexes (keep unique constraints)
      operations.push(
        db
          .collection('users')
          .dropIndex('email_1_deletedAt_1')
          .catch(() => {}),
        db
          .collection('users')
          .dropIndex('username_1_deletedAt_1')
          .catch(() => {}),
        db
          .collection('users')
          .dropIndex('role_1_createdAt_-1')
          .catch(() => {}),
        db
          .collection('users')
          .dropIndex('createdAt_-1')
          .catch(() => {})
      );

      // Drop Record model indexes
      operations.push(
        db
          .collection('records')
          .dropIndex('createdBy_1_createdAt_-1')
          .catch(() => {}),
        db
          .collection('records')
          .dropIndex('patientName_1_createdAt_-1')
          .catch(() => {}),
        db
          .collection('records')
          .dropIndex('patientName_text_diagnosis_text_treatment_text')
          .catch(() => {})
      );

      // Drop Prescription model indexes
      operations.push(
        db
          .collection('prescriptions')
          .dropIndex('patientId_1_issuedDate_-1')
          .catch(() => {}),
        db
          .collection('prescriptions')
          .dropIndex('doctorId_1_issuedDate_-1')
          .catch(() => {}),
        db
          .collection('prescriptions')
          .dropIndex('status_1_expiryDate_1')
          .catch(() => {}),
        db
          .collection('prescriptions')
          .dropIndex('signature_1')
          .catch(() => {}),
        db
          .collection('prescriptions')
          .dropIndex('patientName_text_doctorName_text_medications.name_text_instructions_text')
          .catch(() => {})
      );

      // Drop InventoryItem model indexes
      operations.push(
        db
          .collection('inventoryitems')
          .dropIndex('name_1')
          .catch(() => {}),
        db
          .collection('inventoryitems')
          .dropIndex('category_1_totalQuantity_1')
          .catch(() => {}),
        db
          .collection('inventoryitems')
          .dropIndex('totalQuantity_1_threshold_1')
          .catch(() => {}),
        db
          .collection('inventoryitems')
          .dropIndex('name_text_category_text_sku_text')
          .catch(() => {})
      );

      // Drop MedicalRecord model indexes
      operations.push(
        db
          .collection('medicalrecords')
          .dropIndex('patientId_1_createdAt_-1')
          .catch(() => {})
      );

      await Promise.allSettled(operations);
      console.log('✅ Index optimization rollback complete');
    } catch (error) {
      console.warn('⚠️ Some indexes could not be dropped during rollback:', error.message);
      // Don't throw error for rollback operations
    }
  },
};
