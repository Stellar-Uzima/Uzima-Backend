/* eslint-disable prettier/prettier */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Permission from '../src/models/Permission.js';

// Load environment variables
dotenv.config();

// Default permissions to seed
const defaultPermissions = [
  // Records permissions
  {
    resource: 'records',
    action: 'read',
    roles: ['admin', 'doctor', 'patient'],
    description: 'View medical records',
  },
  {
    resource: 'records',
    action: 'create',
    roles: ['admin', 'doctor'],
    description: 'Create medical records',
  },
  {
    resource: 'records',
    action: 'update',
    roles: ['admin', 'doctor'],
    description: 'Update medical records',
  },
  {
    resource: 'records',
    action: 'delete',
    roles: ['admin'],
    description: 'Delete medical records',
  },

  // Users permissions
  {
    resource: 'users',
    action: 'read',
    roles: ['admin'],
    description: 'View users',
  },
  {
    resource: 'users',
    action: 'manage',
    roles: ['admin'],
    description: 'Full user management (create, update, delete)',
  },

  // Appointments permissions
  {
    resource: 'appointments',
    action: 'read',
    roles: ['admin', 'doctor', 'patient'],
    description: 'View appointments',
  },
  {
    resource: 'appointments',
    action: 'create',
    roles: ['admin', 'doctor', 'patient'],
    description: 'Create appointments',
  },
  {
    resource: 'appointments',
    action: 'update',
    roles: ['admin', 'doctor'],
    description: 'Update appointments',
  },
  {
    resource: 'appointments',
    action: 'delete',
    roles: ['admin', 'doctor'],
    description: 'Delete appointments',
  },

  // Prescriptions permissions
  {
    resource: 'prescriptions',
    action: 'read',
    roles: ['admin', 'doctor', 'patient'],
    description: 'View prescriptions',
  },
  {
    resource: 'prescriptions',
    action: 'create',
    roles: ['admin', 'doctor'],
    description: 'Create prescriptions',
  },
  {
    resource: 'prescriptions',
    action: 'update',
    roles: ['admin', 'doctor'],
    description: 'Update prescriptions',
  },
  {
    resource: 'prescriptions',
    action: 'delete',
    roles: ['admin'],
    description: 'Delete prescriptions',
  },

  // Notifications permissions
  {
    resource: 'notifications',
    action: 'read',
    roles: ['admin', 'doctor', 'patient', 'educator'],
    description: 'View notifications',
  },
  {
    resource: 'notifications',
    action: 'create',
    roles: ['admin', 'doctor'],
    description: 'Create notifications',
  },

  // Files permissions
  {
    resource: 'files',
    action: 'read',
    roles: ['admin', 'doctor', 'patient'],
    description: 'View files and attachments',
  },
  {
    resource: 'files',
    action: 'create',
    roles: ['admin', 'doctor', 'patient'],
    description: 'Upload files and attachments',
  },
  {
    resource: 'files',
    action: 'delete',
    roles: ['admin', 'doctor'],
    description: 'Delete files and attachments',
  },

  // GDPR permissions
  {
    resource: 'gdpr',
    action: 'read',
    roles: ['admin'],
    description: 'View GDPR requests',
  },
  {
    resource: 'gdpr',
    action: 'manage',
    roles: ['admin'],
    description: 'Manage GDPR requests',
  },

  // Audit logs permissions
  {
    resource: 'audit-logs',
    action: 'read',
    roles: ['admin'],
    description: 'View audit logs',
  },

  // Backups permissions
  {
    resource: 'backups',
    action: 'read',
    roles: ['admin'],
    description: 'View backups',
  },
  {
    resource: 'backups',
    action: 'create',
    roles: ['admin'],
    description: 'Create backups',
  },
  {
    resource: 'backups',
    action: 'delete',
    roles: ['admin'],
    description: 'Delete backups',
  },

  // Articles/Educational content permissions
  {
    resource: 'articles',
    action: 'read',
    roles: ['admin', 'doctor', 'patient', 'educator'],
    description: 'View educational articles',
  },
  {
    resource: 'articles',
    action: 'create',
    roles: ['admin', 'educator'],
    description: 'Create educational articles',
  },
  {
    resource: 'articles',
    action: 'update',
    roles: ['admin', 'educator'],
    description: 'Update educational articles',
  },
  {
    resource: 'articles',
    action: 'delete',
    roles: ['admin'],
    description: 'Delete educational articles',
  },

  // Preferences permissions
  {
    resource: 'preferences',
    action: 'read',
    roles: ['admin', 'doctor', 'patient', 'educator'],
    description: 'View user preferences',
  },
  {
    resource: 'preferences',
    action: 'update',
    roles: ['admin', 'doctor', 'patient', 'educator'],
    description: 'Update user preferences',
  },
];

/**
 * Seed permissions into the database
 */
async function seedPermissions() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/uzima';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Check if permissions already exist
    const existingCount = await Permission.countDocuments();
    if (existingCount > 0) {
      console.log(`Found ${existingCount} existing permissions.`);
      console.log('Do you want to:');
      console.log('1. Skip seeding (keep existing permissions)');
      console.log('2. Clear and reseed all permissions');
      console.log('3. Add only missing permissions');
      
      // For now, we'll add only missing permissions (option 3)
      console.log('\nAdding only missing permissions...');
    }

    let addedCount = 0;
    let skippedCount = 0;

    for (const permData of defaultPermissions) {
      try {
        // Check if permission exists
        const existing = await Permission.findByResourceAction(
          permData.resource,
          permData.action
        );

        if (existing) {
          console.log(`⏭️  Skipped: ${permData.resource}:${permData.action} (already exists)`);
          skippedCount++;
        } else {
          // Create new permission
          await Permission.create(permData);
          console.log(`✅ Added: ${permData.resource}:${permData.action}`);
          addedCount++;
        }
      } catch (error) {
        console.error(`❌ Error processing ${permData.resource}:${permData.action}:`, error.message);
      }
    }

    console.log('\n📊 Seeding Summary:');
    console.log(`   Added: ${addedCount} permissions`);
    console.log(`   Skipped: ${skippedCount} permissions`);
    console.log(`   Total in DB: ${await Permission.countDocuments()} permissions`);

    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('\n✅ Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding permissions:', error);
    process.exit(1);
  }
}

// Run the seed function
seedPermissions();
