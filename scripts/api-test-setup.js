/**
 * API Test Setup Script
 * 
 * Responsibilities:
 * - Connect to MongoDB
 * - Create/seed test users (admin, doctor, patient, staff)
 * - Authenticate users and capture JWT tokens
 * - Create sample test data (records, prescriptions, inventory)
 * - Export tokens and IDs to postman environment files
 * - Cleanup old test data
 */

import axios from 'axios';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import bcryptjs from 'bcryptjs';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/uzima_dev';
const ENVIRONMENT = process.env.NODE_ENV || 'development';

// Test user credentials
const TEST_USERS = {
  admin: {
    email: 'admin.test@uzima.local',
    password: 'AdminTest@123',
    username: 'admin_test',
    role: 'admin',
  },
  doctor: {
    email: 'doctor.test@uzima.local',
    password: 'DoctorTest@123',
    username: 'doctor_test',
    role: 'doctor',
  },
  patient: {
    email: 'patient.test@uzima.local',
    password: 'PatientTest@123',
    username: 'patient_test',
    role: 'patient',
  },
  staff: {
    email: 'staff.test@uzima.local',
    password: 'StaffTest@123',
    username: 'staff_test',
    role: 'staff',
  },
};

const API_CLIENT = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  validateStatus: () => true, // Don't throw on any status
});

/**
 * Connect to MongoDB
 */
async function connectDatabase() {
  try {
    console.log('📦 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB connected');
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    return false;
  }
}

/**
 * Disconnect from MongoDB
 */
async function disconnectDatabase() {
  try {
    await mongoose.disconnect();
    console.log('✅ MongoDB disconnected');
  } catch (error) {
    console.error('⚠️  MongoDB disconnection error:', error.message);
  }
}

/**
 * Wait for API server to be ready
 */
async function waitForAPI(maxRetries = 30) {
  console.log('⏳ Waiting for API server...');
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/health`, { timeout: 2000 });
      if (response.status === 200) {
        console.log('✅ API server is ready');
        return true;
      }
    } catch (error) {
      // Continue retrying
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.error('❌ API server did not start within timeout');
  return false;
}

/**
 * Register or authenticate a test user
 */
async function authenticateUser(userConfig) {
  const { email, password, username, role } = userConfig;

  try {
    // Try to login first
    console.log(`🔐 Authenticating ${role} user (${email})...`);
    let response = await API_CLIENT.post('/api/auth/login', {
      email,
      password,
    });

    if (response.status === 200 && response.data.token) {
      console.log(`✅ ${role} user logged in successfully`);
      return {
        token: response.data.token,
        userId: response.data.user?._id,
        role,
        email,
      };
    }

    // If login failed, try to register
    if (response.status === 401 || response.status === 404) {
      console.log(`📝 Registering ${role} user (${email})...`);
      response = await API_CLIENT.post('/api/auth/register', {
        email,
        password,
        username,
        role,
      });

      if (response.status === 201 && response.data.token) {
        console.log(`✅ ${role} user registered successfully`);
        return {
          token: response.data.token,
          userId: response.data.user?._id,
          role,
          email,
        };
      }
    }

    console.error(
      `❌ Failed to authenticate ${role} user:`,
      response.data?.message || response.statusText
    );
    return null;
  } catch (error) {
    console.error(`❌ Error authenticating ${role} user:`, error.message);
    return null;
  }
}

/**
 * Create sample test data
 */
async function createTestData(authTokens) {
  const testData = {};

  try {
    // Create a test medical record as doctor
    console.log('📝 Creating test medical record...');
    const recordResponse = await API_CLIENT.post(
      '/api/records',
      {
        patientId: authTokens.patient?.userId,
        title: 'API Test Record',
        description: 'Sample medical record for API testing',
        recordType: 'general',
      },
      {
        headers: {
          Authorization: `Bearer ${authTokens.doctor?.token}`,
        },
      }
    );

    if (recordResponse.status === 201 && recordResponse.data.data?._id) {
      testData.testRecordId = recordResponse.data.data._id;
      console.log(`✅ Test record created: ${testData.testRecordId}`);
    }
  } catch (error) {
    console.warn('⚠️  Could not create test record:', error.message);
  }

  try {
    // Create a test prescription as doctor
    console.log('📝 Creating test prescription...');
    const prescResponse = await API_CLIENT.post(
      '/api/prescriptions',
      {
        patientId: authTokens.patient?.userId,
        medications: [
          {
            name: 'Amoxicillin',
            dosage: '500mg',
            frequency: 'twice daily',
            duration: '7 days',
          },
        ],
        notes: 'Test prescription for API testing',
      },
      {
        headers: {
          Authorization: `Bearer ${authTokens.doctor?.token}`,
        },
      }
    );

    if (prescResponse.status === 201 && prescResponse.data.data?._id) {
      testData.testPrescriptionId = prescResponse.data.data._id;
      console.log(`✅ Test prescription created: ${testData.testPrescriptionId}`);
    }
  } catch (error) {
    console.warn('⚠️  Could not create test prescription:', error.message);
  }

  try {
    // Create test inventory item
    console.log('📝 Creating test inventory item...');
    const invResponse = await API_CLIENT.post(
      '/api/inventory',
      {
        sku: `TEST-SKU-${Date.now()}`,
        name: 'Test Inventory Item',
        category: 'medication',
        unit: 'box',
        threshold: 10,
        lots: [
          {
            lotNumber: `LOT-${Date.now()}`,
            quantity: 100,
            expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${authTokens.admin?.token}`,
        },
      }
    );

    if (invResponse.status === 201 && invResponse.data.data?.sku) {
      testData.testInventorySKU = invResponse.data.data.sku;
      console.log(`✅ Test inventory item created: ${testData.testInventorySKU}`);
    }
  } catch (error) {
    console.warn('⚠️  Could not create test inventory:', error.message);
  }

  return testData;
}

/**
 * Update Postman environment file with tokens and test data
 */
async function updateEnvironmentFiles(authTokens, testData) {
  const environmentsDir = path.join(__dirname, '..', 'postman', 'environments');
  const environmentFileName = `${ENVIRONMENT === 'production' ? 'Production' : ENVIRONMENT === 'staging' ? 'Staging' : 'Development'}.postman_environment.json`;
  const environmentPath = path.join(environmentsDir, environmentFileName);

  try {
    console.log(`📄 Updating environment file: ${environmentFileName}`);

    // Read current environment
    let environment = {};
    if (fs.existsSync(environmentPath)) {
      const content = fs.readFileSync(environmentPath, 'utf8');
      environment = JSON.parse(content);
    }

    // Update values
    const valueMap = {
      adminToken: authTokens.admin?.token || '',
      doctorToken: authTokens.doctor?.token || '',
      patientToken: authTokens.patient?.token || '',
      staffToken: authTokens.staff?.token || '',
      testUserId: authTokens.patient?.userId || '',
      testRecordId: testData.testRecordId || '',
      testPrescriptionId: testData.testPrescriptionId || '',
      testInventorySKU: testData.testInventorySKU || '',
      timestamp: new Date().toISOString(),
      correlationId: `test-${Date.now()}`,
    };

    // Update or create values
    if (!environment.values) {
      environment.values = [];
    }

    Object.entries(valueMap).forEach(([key, value]) => {
      const existing = environment.values.find(v => v.key === key);
      if (existing) {
        existing.value = value;
      } else {
        environment.values.push({
          key,
          value,
          type: 'string',
          enabled: true,
        });
      }
    });

    // Write updated environment
    fs.writeFileSync(environmentPath, JSON.stringify(environment, null, 2));
    console.log(`✅ Environment file updated: ${environmentFileName}`);
  } catch (error) {
    console.error(`❌ Error updating environment file:`, error.message);
  }
}

/**
 * Cleanup old test data (optional)
 */
async function cleanupOldTestData() {
  try {
    console.log('🧹 Cleaning up old test data...');
    // Import models
    const { default: User } = await import('../src/models/User.js');
    
    // Remove test users older than 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await User.deleteMany({
      email: { $regex: 'test@uzima.local$' },
      createdAt: { $lt: oneDayAgo },
    });
    
    if (result.deletedCount > 0) {
      console.log(`✅ Cleaned up ${result.deletedCount} old test users`);
    }
  } catch (error) {
    console.warn('⚠️  Could not cleanup old test data:', error.message);
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('\n🚀 Starting API Test Setup\n');
  console.log(`Environment: ${ENVIRONMENT}`);
  console.log(`API Base URL: ${API_BASE_URL}`);
  console.log(`MongoDB URI: ${MONGO_URI}\n`);

  try {
    // Wait for API to be ready
    const apiReady = await waitForAPI();
    if (!apiReady) {
      process.exit(1);
    }

    // Authenticate test users
    console.log('\n🔐 Authenticating test users...\n');
    const authTokens = {};
    for (const [roleKey, userConfig] of Object.entries(TEST_USERS)) {
      authTokens[roleKey] = await authenticateUser(userConfig);
    }

    // Verify at least one user was authenticated
    const authenticatedUsers = Object.values(authTokens).filter(u => u !== null);
    if (authenticatedUsers.length === 0) {
      console.error('❌ Could not authenticate any test users');
      process.exit(1);
    }

    console.log(`\n✅ Authenticated ${authenticatedUsers.length} test users\n`);

    // Create test data
    console.log('📊 Creating test data...\n');
    const testData = await createTestData(authTokens);

    // Update environment files
    console.log('\n📝 Updating environment files...\n');
    await updateEnvironmentFiles(authTokens, testData);

    // Cleanup (optional, only in dev)
    if (ENVIRONMENT === 'development') {
      await connectDatabase();
      await cleanupOldTestData();
      await disconnectDatabase();
    }

    console.log('\n✅ API Test Setup Completed!\n');
    console.log('📌 Summary:');
    console.log(`   - Admin Token: ${authTokens.admin?.token ? '✅' : '❌'}`);
    console.log(`   - Doctor Token: ${authTokens.doctor?.token ? '✅' : '❌'}`);
    console.log(`   - Patient Token: ${authTokens.patient?.token ? '✅' : '❌'}`);
    console.log(`   - Staff Token: ${authTokens.staff?.token ? '✅' : '❌'}`);
    console.log(`   - Test Record ID: ${testData.testRecordId ? '✅' : '⚠️'}`);
    console.log(`   - Test Prescription ID: ${testData.testPrescriptionId ? '✅' : '⚠️'}`);
    console.log(`   - Test Inventory SKU: ${testData.testInventorySKU ? '✅' : '⚠️'}`);
    console.log('\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    process.exit(1);
  }
}

// Run setup
main();
