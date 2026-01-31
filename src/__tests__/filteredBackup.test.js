import axios from 'axios';

/**
 * Test file for Filtered Backup API
 * Run these tests to verify the backup functionality works correctly
 */

const API_BASE_URL = 'http://localhost:3000/api/admin/backups';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'your-jwt-token-here';

const client = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    Authorization: `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

/**
 * Test 1: Create a filtered backup with all filters
 */
export async function testCreateFilteredBackup() {
  console.log('\n=== Test 1: Create Filtered Backup ===');

  try {
    const response = await client.post('/create', {
      collections: ['users', 'records', 'prescriptions'],
      filters: {
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-12-31T23:59:59Z',
        recordTypes: ['prescription', 'vital'],
        status: ['active'],
      },
      format: 'both',
    });

    console.log('✓ Backup created successfully');
    console.log('Backup ID:', response.data.data.backupId);
    console.log('Total Records:', response.data.data.metadata.totalRecords);
    console.log('Duration:', response.data.data.duration);

    return response.data.data.backupId;
  } catch (error) {
    console.error('✗ Failed to create backup:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Test 2: Create user-specific backup
 */
export async function testCreateUserSpecificBackup(userId) {
  console.log('\n=== Test 2: Create User-Specific Backup ===');

  try {
    const response = await client.post('/create', {
      collections: ['records', 'prescriptions'],
      filters: {
        userId: userId,
      },
      format: 'json',
    });

    console.log('✓ User-specific backup created');
    console.log('Backup ID:', response.data.data.backupId);
    console.log('Total Records:', response.data.data.metadata.totalRecords);

    return response.data.data.backupId;
  } catch (error) {
    console.error(
      '✗ Failed to create user-specific backup:',
      error.response?.data || error.message
    );
    return null;
  }
}

/**
 * Test 3: Create date-range backup
 */
export async function testCreateDateRangeBackup() {
  console.log('\n=== Test 3: Create Date-Range Backup ===');

  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30); // 30 days ago

    const response = await client.post('/create', {
      collections: ['records'],
      filters: {
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString(),
      },
      format: 'csv',
    });

    console.log('✓ Date-range backup created');
    console.log('Backup ID:', response.data.data.backupId);
    console.log('Date Range:', `${startDate.toISOString()} to ${new Date().toISOString()}`);

    return response.data.data.backupId;
  } catch (error) {
    console.error('✗ Failed to create date-range backup:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Test 4: List all filtered backups
 */
export async function testListFilteredBackups() {
  console.log('\n=== Test 4: List Filtered Backups ===');

  try {
    const response = await client.get('/filtered?page=1&limit=10');

    console.log('✓ Backups retrieved successfully');
    console.log('Total Backups:', response.data.data.pagination.total);
    console.log('Current Page:', response.data.data.pagination.currentPage);
    console.log('Backups:');

    response.data.data.backups.forEach((backup, index) => {
      console.log(`  ${index + 1}. ${backup.backupId}`);
      console.log(`     Created: ${backup.createdAt}`);
      console.log(`     Total Records: ${backup.filteredBackupMetadata.totalRecords}`);
    });

    return response.data.data.backups.length > 0 ? response.data.data.backups[0].backupId : null;
  } catch (error) {
    console.error('✗ Failed to list backups:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Test 5: Get backup metadata
 */
export async function testGetBackupMetadata(backupId) {
  console.log('\n=== Test 5: Get Backup Metadata ===');

  if (!backupId) {
    console.warn('⚠ No backup ID provided, skipping test');
    return;
  }

  try {
    const response = await client.get(`/${backupId}/metadata`);

    console.log('✓ Metadata retrieved successfully');
    console.log('Backup ID:', response.data.data.backupId);
    console.log('Format:', response.data.data.format);
    console.log('Total Records:', response.data.data.totalRecords);
    console.log('File Size:', response.data.data.size, 'bytes');
    console.log('Collections:');

    Object.entries(response.data.data.recordCounts).forEach(([collection, count]) => {
      console.log(`  - ${collection}: ${count} records`);
    });

    console.log('Filters Applied:');
    response.data.data.filtersApplied.forEach(filter => {
      console.log(`  - ${filter}`);
    });
  } catch (error) {
    console.error('✗ Failed to get metadata:', error.response?.data || error.message);
  }
}

/**
 * Test 6: Download JSON file
 */
export async function testDownloadJSONFile(backupId) {
  console.log('\n=== Test 6: Download JSON File ===');

  if (!backupId) {
    console.warn('⚠ No backup ID provided, skipping test');
    return;
  }

  try {
    const response = await client.get(`/${backupId}/file?format=json`, {
      responseType: 'arraybuffer',
    });

    console.log('✓ JSON file downloaded successfully');
    console.log('File Size:', response.data.length, 'bytes');
    console.log('Content-Type:', response.headers['content-type']);
    console.log('Headers:', {
      'Content-Disposition': response.headers['content-disposition'],
      'Content-Length': response.headers['content-length'],
    });
  } catch (error) {
    console.error('✗ Failed to download JSON file:', error.response?.data || error.message);
  }
}

/**
 * Test 7: Download CSV file
 */
export async function testDownloadCSVFile(backupId) {
  console.log('\n=== Test 7: Download CSV File ===');

  if (!backupId) {
    console.warn('⚠ No backup ID provided, skipping test');
    return;
  }

  try {
    const response = await client.get(`/${backupId}/file?format=csv`, {
      responseType: 'arraybuffer',
    });

    console.log('✓ CSV file downloaded successfully');
    console.log('File Size:', response.data.length, 'bytes');
    console.log('Content-Type:', response.headers['content-type']);
    console.log('Headers:', {
      'Content-Disposition': response.headers['content-disposition'],
      'Content-Length': response.headers['content-length'],
    });
  } catch (error) {
    console.error('✗ Failed to download CSV file:', error.response?.data || error.message);
  }
}

/**
 * Test 8: Delete filtered backup
 */
export async function testDeleteFilteredBackup(backupId) {
  console.log('\n=== Test 8: Delete Filtered Backup ===');

  if (!backupId) {
    console.warn('⚠ No backup ID provided, skipping test');
    return;
  }

  try {
    const response = await client.delete(`/${backupId}/filtered`);

    console.log('✓ Backup deleted successfully');
    console.log('Message:', response.data.message);
  } catch (error) {
    console.error('✗ Failed to delete backup:', error.response?.data || error.message);
  }
}

/**
 * Test 9: Error handling - invalid format
 */
export async function testErrorHandling() {
  console.log('\n=== Test 9: Error Handling - Invalid Format ===');

  try {
    await client.post('/create', {
      collections: ['records'],
      format: 'invalid-format',
    });

    console.error('✗ Should have thrown an error for invalid format');
  } catch (error) {
    console.log('✓ Properly rejected invalid format');
    console.log('Error Message:', error.response?.data?.message);
  }
}

/**
 * Test 10: Error handling - missing collections
 */
export async function testErrorHandlingMissingCollections() {
  console.log('\n=== Test 10: Error Handling - Missing Collections ===');

  try {
    await client.post('/create', {
      filters: {},
      format: 'json',
    });

    console.error('✗ Should have thrown an error for missing collections');
  } catch (error) {
    console.log('✓ Properly rejected missing collections');
    console.log('Error Message:', error.response?.data?.message);
  }
}

/**
 * Run all tests
 */
export async function runAllTests() {
  console.log('====================================');
  console.log('Filtered Backup API Test Suite');
  console.log('====================================');

  // Test error handling first (non-destructive)
  await testErrorHandling();
  await testErrorHandlingMissingCollections();

  // Create backups
  let backupId = await testCreateFilteredBackup();
  let userBackupId = await testCreateUserSpecificBackup('507f1f77bcf86cd799439011');
  let dateBackupId = await testCreateDateRangeBackup();

  // List backups
  const listedBackupId = await testListFilteredBackups();

  // Use listed backup for further tests
  const testBackupId = backupId || listedBackupId || dateBackupId;

  // Get metadata
  await testGetBackupMetadata(testBackupId);

  // Download files
  await testDownloadJSONFile(testBackupId);
  await testDownloadCSVFile(testBackupId);

  // Cleanup (only delete the date-range backup as a test)
  if (dateBackupId) {
    await testDeleteFilteredBackup(dateBackupId);
  }

  console.log('\n====================================');
  console.log('Tests Complete');
  console.log('====================================');
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
}

export default {
  testCreateFilteredBackup,
  testCreateUserSpecificBackup,
  testCreateDateRangeBackup,
  testListFilteredBackups,
  testGetBackupMetadata,
  testDownloadJSONFile,
  testDownloadCSVFile,
  testDeleteFilteredBackup,
  testErrorHandling,
  testErrorHandlingMissingCollections,
  runAllTests,
};
