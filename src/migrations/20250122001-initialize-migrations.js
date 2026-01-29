/**
 * Migration: Initialize Migrations Table
 * Description: Create indexes and setup migration tracking
 */

export const name = 'Initialize Migrations Table';
export const description =
  'Create initial migrations collection with proper indexes';

/**
 * Up migration - Apply changes
 */
export async function up() {
  const db = mongoose.connection.db;

  // Create migrations collection
  try {
    await db.createCollection('migrations');
    console.log('✓ Created migrations collection');
  } catch (error) {
    if (error.codeName !== 'NamespaceExists') {
      throw error;
    }
    console.log('✓ Migrations collection already exists');
  }

  // Create indexes
  const migrationsCollection = db.collection('migrations');
  await migrationsCollection.createIndex({ version: 1 }, { unique: true });
  await migrationsCollection.createIndex({ status: 1 });
  await migrationsCollection.createIndex({ createdAt: -1 });

  console.log('✓ Created migration indexes');
}

/**
 * Down migration - Rollback changes
 * Note: Not reversible - drop collection
 */
export async function down() {
  const db = mongoose.connection.db;

  try {
    await db.dropCollection('migrations');
    console.log('✓ Dropped migrations collection');
  } catch (error) {
    if (error.codeName === 'ns not found') {
      console.log('✓ Migrations collection does not exist');
    } else {
      throw error;
    }
  }
}
