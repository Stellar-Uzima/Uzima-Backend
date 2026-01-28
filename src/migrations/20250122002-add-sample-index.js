/**
 * Migration: Add Sample Index for Performance
 * Description: Create indexes for commonly queried fields to improve performance
 */

import mongoose from 'mongoose';

export const name = 'Add Sample Index for Performance';
export const description =
  'Create indexes on frequently queried fields for faster lookups';

/**
 * Up migration - Apply changes
 */
export async function up() {
  const db = mongoose.connection.db;

  try {
    // Example: Create indexes on prescription collection
    const prescriptionsCollection = db.collection('prescriptions');
    await prescriptionsCollection.createIndex({ patientId: 1 });
    await prescriptionsCollection.createIndex({ status: 1 });
    await prescriptionsCollection.createIndex({ createdAt: -1 });

    console.log('✓ Created indexes on prescriptions collection');

    // Example: Create indexes on patients collection
    const patientsCollection = db.collection('patients');
    await patientsCollection.createIndex({ email: 1 });
    await patientsCollection.createIndex({ phoneNumber: 1 });

    console.log('✓ Created indexes on patients collection');
  } catch (error) {
    if (!error.message.includes('already exists')) {
      throw error;
    }
    console.log('✓ Indexes already exist');
  }
}

/**
 * Down migration - Rollback changes
 */
export async function down() {
  const db = mongoose.connection.db;

  try {
    const prescriptionsCollection = db.collection('prescriptions');
    await prescriptionsCollection.dropIndex('patientId_1');
    await prescriptionsCollection.dropIndex('status_1');
    await prescriptionsCollection.dropIndex('createdAt_-1');

    console.log('✓ Dropped indexes from prescriptions collection');

    const patientsCollection = db.collection('patients');
    await patientsCollection.dropIndex('email_1');
    await patientsCollection.dropIndex('phoneNumber_1');

    console.log('✓ Dropped indexes from patients collection');
  } catch (error) {
    if (!error.message.includes('index not found')) {
      throw error;
    }
    console.log('✓ Indexes not found, already dropped or never existed');
  }
}
