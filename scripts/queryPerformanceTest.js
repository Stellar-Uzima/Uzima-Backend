#!/usr/bin/env node
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import models
import User from '../src/models/User.js';
import Record from '../src/models/Record.js';
import ActivityLog from '../src/models/ActivityLog.js';
import Prescription from '../src/models/Prescription.js';
import InventoryItem from '../src/models/InventoryItem.js';
import Patient from '../src/models/patient.model.js';
import MedicalRecord from '../src/models/medicalRecord.m.model.js';

/**
 * Performance testing utility to measure query execution times
 * and verify that database indexes are working correctly
 */

class QueryPerformanceTester {
  constructor() {
    this.results = [];
    this.targetTime = 100; // Target <100ms for all queries
  }

  async connect() {
    try {
      await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/uzima');
      console.log('✅ Connected to MongoDB for performance testing');
    } catch (error) {
      console.error('❌ Failed to connect to MongoDB:', error.message);
      process.exit(1);
    }
  }

  async disconnect() {
    await mongoose.disconnect();
    console.log('📝 Disconnected from MongoDB');
  }

  /**
   * Measure query execution time with .explain() analysis
   */
  async measureQuery(description, queryFn, targetTime = this.targetTime) {
    const startTime = Date.now();

    try {
      const result = await queryFn();
      const executionTime = Date.now() - startTime;

      // Get explain data if available
      let indexUsed = 'N/A';
      let docsExamined = 'N/A';

      if (result && typeof result.explain === 'function') {
        const explanation = await result.explain('executionStats');
        indexUsed =
          explanation.executionStats?.executionStages?.indexName ||
          explanation.executionStats?.indexName ||
          'No index used';
        docsExamined = explanation.executionStats?.totalDocsExamined || 'N/A';
      }

      const testResult = {
        description,
        executionTime,
        targetTime,
        passed: executionTime <= targetTime,
        indexUsed,
        docsExamined,
        resultCount: Array.isArray(result) ? result.length : result ? 1 : 0,
      };

      this.results.push(testResult);

      const status = testResult.passed ? '✅' : '❌';
      console.log(`${status} ${description}: ${executionTime}ms (target: ≤${targetTime}ms)`);

      if (!testResult.passed) {
        console.log(`   ⚠️  Index used: ${indexUsed}, Docs examined: ${docsExamined}`);
      }

      return testResult;
    } catch (error) {
      console.error(`❌ ${description}: Error - ${error.message}`);
      this.results.push({
        description,
        executionTime: -1,
        targetTime,
        passed: false,
        error: error.message,
      });
    }
  }

  /**
   * Run comprehensive performance tests
   */
  async runPerformanceTests() {
    console.log('🚀 Starting database query performance tests...\n');

    // 1. User Authentication Queries
    console.log('👤 Testing User Authentication Queries:');
    await this.measureQuery(
      'User.findOne({ email })',
      () => User.findOne({ email: 'test@example.com' }),
      10
    );

    await this.measureQuery(
      'User.findOne({ username })',
      () => User.findOne({ username: 'testuser' }),
      10
    );

    await this.measureQuery('User.find({ role, deletedAt: null }).sort({ createdAt: -1 })', () =>
      User.find({ role: 'doctor', deletedAt: null }).sort({ createdAt: -1 }).limit(10)
    );

    // 2. Medical Record Queries
    console.log('\n📋 Testing Medical Record Queries:');
    const sampleUserId = new mongoose.Types.ObjectId();

    await this.measureQuery('Record.find({ createdBy }).sort({ createdAt: -1 })', () =>
      Record.find({ createdBy: sampleUserId, deletedAt: null }).sort({ createdAt: -1 }).limit(20)
    );

    await this.measureQuery('Record.find({ patientName }).sort({ createdAt: -1 })', () =>
      Record.find({ patientName: /John/i }).sort({ createdAt: -1 }).limit(10)
    );

    // 3. Text Search Queries
    console.log('\n🔍 Testing Text Search Queries:');
    await this.measureQuery('Record.find({ $text: { $search: "diagnosis" } })', () =>
      Record.find({ $text: { $search: 'diagnosis treatment' } }).limit(10)
    );

    await this.measureQuery('Patient.find({ $text: { $search: "patient" } })', () =>
      Patient.find({ $text: { $search: 'patient name' } }).limit(10)
    );

    // 4. Activity Log Queries
    console.log('\n📊 Testing Activity Log Queries:');
    await this.measureQuery('ActivityLog.find({ userId }).sort({ timestamp: -1 })', () =>
      ActivityLog.find({ userId: sampleUserId }).sort({ timestamp: -1 }).limit(50)
    );

    await this.measureQuery('ActivityLog.find({ userId, action }).sort({ timestamp: -1 })', () =>
      ActivityLog.find({
        userId: sampleUserId,
        action: 'login',
      })
        .sort({ timestamp: -1 })
        .limit(20)
    );

    // 5. Prescription Queries
    console.log('\n💊 Testing Prescription Queries:');
    await this.measureQuery(
      'Prescription.findOne({ prescriptionNumber })',
      () => Prescription.findOne({ prescriptionNumber: 'RX-TEST-001' }),
      10
    );

    await this.measureQuery('Prescription.find({ patientId }).sort({ issuedDate: -1 })', () =>
      Prescription.find({ patientId: sampleUserId }).sort({ issuedDate: -1 }).limit(10)
    );

    await this.measureQuery('Prescription.find({ status, expiryDate })', () =>
      Prescription.find({
        status: 'active',
        expiryDate: { $gte: new Date() },
      }).limit(10)
    );

    // 6. Inventory Queries
    console.log('\n📦 Testing Inventory Queries:');
    await this.measureQuery('InventoryItem.find({ totalQuantity <= threshold })', () =>
      InventoryItem.find({
        $expr: { $lte: ['$totalQuantity', '$threshold'] },
      }).limit(20)
    );

    await this.measureQuery('InventoryItem.find({ category }).sort({ totalQuantity: 1 })', () =>
      InventoryItem.find({ category: 'medication' }).sort({ totalQuantity: 1 }).limit(10)
    );

    await this.measureQuery('InventoryItem.find({ $text: { $search: "medicine" } })', () =>
      InventoryItem.find({ $text: { $search: 'medicine drug' } }).limit(10)
    );

    // 7. Complex Aggregate Queries
    console.log('\n🔄 Testing Complex Aggregate Queries:');
    await this.measureQuery(
      'ActivityLog.getUserActivitySummary()',
      () => ActivityLog.getUserActivitySummary(sampleUserId, 30),
      150
    );

    await this.measureQuery(
      'ActivityLog.getActivityStats()',
      () =>
        ActivityLog.getActivityStats({
          startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          endDate: new Date(),
        }),
      200
    );
  }

  /**
   * Print comprehensive test results
   */
  printResults() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 QUERY PERFORMANCE TEST RESULTS');
    console.log('='.repeat(80));

    const passed = this.results.filter(r => r.passed && !r.error).length;
    const failed = this.results.filter(r => !r.passed || r.error).length;
    const total = this.results.length;

    console.log(
      `\n📈 Summary: ${passed}/${total} tests passed (${Math.round((passed / total) * 100)}%)`
    );

    if (failed > 0) {
      console.log(`\n❌ Failed Tests (${failed}):`);
      this.results
        .filter(r => !r.passed || r.error)
        .forEach(result => {
          console.log(`   • ${result.description}`);
          if (result.error) {
            console.log(`     Error: ${result.error}`);
          } else {
            console.log(`     Time: ${result.executionTime}ms (target: ≤${result.targetTime}ms)`);
            console.log(`     Index: ${result.indexUsed}`);
          }
        });
    }

    // Performance Statistics
    const validResults = this.results.filter(r => !r.error && r.executionTime > 0);
    if (validResults.length > 0) {
      const times = validResults.map(r => r.executionTime);
      const avgTime = times.reduce((a, b) => a + b) / times.length;
      const maxTime = Math.max(...times);
      const minTime = Math.min(...times);

      console.log(`\n📊 Performance Statistics:`);
      console.log(`   Average query time: ${Math.round(avgTime)}ms`);
      console.log(`   Fastest query: ${minTime}ms`);
      console.log(`   Slowest query: ${maxTime}ms`);
      console.log(`   Target achievement: ${passed}/${total} queries under target time`);
    }

    // Index Usage Analysis
    const indexUsage = this.results
      .filter(r => r.indexUsed && r.indexUsed !== 'N/A')
      .reduce((acc, r) => {
        acc[r.indexUsed] = (acc[r.indexUsed] || 0) + 1;
        return acc;
      }, {});

    if (Object.keys(indexUsage).length > 0) {
      console.log(`\n🗂️  Index Usage:`);
      Object.entries(indexUsage)
        .sort(([, a], [, b]) => b - a)
        .forEach(([index, count]) => {
          console.log(`   • ${index}: ${count} queries`);
        });
    }

    console.log('\n' + '='.repeat(80));

    // Exit with error code if any tests failed
    if (failed > 0) {
      console.log('❌ Some performance tests failed. Consider optimizing slow queries.');
      process.exit(1);
    } else {
      console.log('✅ All performance tests passed! Database optimization successful.');
      process.exit(0);
    }
  }
}

/**
 * Main execution function
 */
async function main() {
  const tester = new QueryPerformanceTester();

  try {
    await tester.connect();
    await tester.runPerformanceTests();
    tester.printResults();
  } catch (error) {
    console.error('❌ Performance test failed:', error.message);
    process.exit(1);
  } finally {
    await tester.disconnect();
  }
}

// Run the performance tests
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default QueryPerformanceTester;
