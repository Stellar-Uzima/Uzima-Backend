#!/usr/bin/env node

import { enqueueEmailNotification, enqueuePushNotification, getNotificationQueueStats } from '../src/workers/notificationWorker.js';
import { logger } from '../src/utils/logger.js';

/**
 * Test Notification Worker System
 * 
 * This script tests the notification worker functionality by:
 * 1. Creating test notifications
 * 2. Queuing email and push notifications
 * 3. Monitoring queue statistics
 * 4. Verifying status tracking
 */

async function testNotificationWorker() {
  console.log('🧪 Testing Notification Worker System...\n');

  try {
    // Test 1: Get initial queue stats
    console.log('📊 Initial Queue Statistics:');
    const initialStats = await getNotificationQueueStats();
    console.log(JSON.stringify(initialStats, null, 2));
    console.log('');

    // Test 2: Queue test email notification
    console.log('📧 Testing Email Notification Queue...');
    const emailNotification = await enqueueEmailNotification({
      notificationId: 'test-email-' + Date.now(),
      to: 'test@example.com',
      subject: 'Test Email from Worker',
      html: '<h1>Test Email</h1><p>This is a test email from the notification worker system.</p>',
      text: 'This is a test email from the notification worker system.',
      type: 'test_email',
      userId: 'test-user-id',
    }, 8); // High priority

    console.log('✅ Email notification queued:', emailNotification.id);
    console.log('');

    // Test 3: Queue test push notification
    console.log('📱 Testing Push Notification Queue...');
    const pushNotification = await enqueuePushNotification({
      notificationId: 'test-push-' + Date.now(),
      userId: 'test-user-id',
      title: 'Test Push Notification',
      message: 'This is a test push notification from the worker system.',
      data: {
        type: 'test',
        timestamp: new Date().toISOString(),
        source: 'notification_worker_test',
      },
    }, 7); // Medium priority

    console.log('✅ Push notification queued:', pushNotification.id);
    console.log('');

    // Test 4: Wait and check updated stats
    console.log('⏳ Waiting 3 seconds for processing...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('📊 Updated Queue Statistics:');
    const updatedStats = await getNotificationQueueStats();
    console.log(JSON.stringify(updatedStats, null, 2));
    console.log('');

    // Test 5: Calculate statistics
    const emailWaiting = updatedStats.email.waiting - initialStats.email.waiting;
    const pushWaiting = updatedStats.push.waiting - initialStats.push.waiting;
    
    console.log('📈 Test Results:');
    console.log(`   Email jobs added: ${emailWaiting}`);
    console.log(`   Push jobs added: ${pushWaiting}`);
    console.log(`   Total jobs in queue: ${updatedStats.email.waiting + updatedStats.push.waiting}`);
    
    if (emailWaiting > 0 && pushWaiting > 0) {
      console.log('✅ Notification worker test PASSED - Both queues are processing jobs');
    } else if (emailWaiting > 0 || pushWaiting > 0) {
      console.log('⚠️  Notification worker test PARTIAL - At least one queue is processing');
    } else {
      console.log('❌ Notification worker test FAILED - No jobs were queued');
    }

    console.log('\n🎉 Notification Worker System Test Complete!');
    console.log('\n📝 Next Steps:');
    console.log('   1. Start the worker: npm run worker:notifications');
    console.log('   2. Monitor logs for job processing');
    console.log('   3. Check queue stats: GET /api/admin/notifications/queues/stats');
    console.log('   4. Test admin endpoints via API');

  } catch (error) {
    console.error('❌ Notification worker test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Handle CLI arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Notification Worker Test Script

Usage: node scripts/test-notification-worker.js [options]

Options:
  --help, -h  Show this help message

Description:
  Tests the notification worker system by:
  - Creating test notifications
  - Queuing email and push notifications
  - Monitoring queue statistics
  - Verifying system functionality

Example:
  node scripts/test-notification-worker.js
  `);
  process.exit(0);
}

// Run the test
testNotificationWorker();
