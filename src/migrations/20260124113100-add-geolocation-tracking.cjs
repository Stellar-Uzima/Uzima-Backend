/**
 * Migration: Add geolocation tracking and browser fingerprinting
 * 
 * This migration creates:
 * - userdevices collection with indexes
 * - loginhistories collection with indexes and TTL
 * - Updates to User model for security tracking
 */

module.exports = {
  async up(db, client) {
    console.log('Starting migration: add-geolocation-tracking...');

    // 1. Create userdevices collection
    console.log('Creating userdevices collection...');
    await db.createCollection('userdevices', {
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['userId', 'fingerprint', 'fingerprintHash', 'firstSeenAt', 'lastSeenAt'],
          properties: {
            userId: {
              bsonType: 'objectId',
              description: 'Reference to User - required',
            },
            fingerprint: {
              bsonType: 'string',
              description: 'FingerprintJS visitorId - required',
            },
            fingerprintHash: {
              bsonType: 'string',
              description: 'SHA-256 hash of fingerprint - required',
            },
            deviceInfo: {
              bsonType: 'object',
              properties: {
                userAgent: { bsonType: 'string' },
                browser: { bsonType: 'string' },
                os: { bsonType: 'string' },
                device: { bsonType: 'string' },
                screenResolution: { bsonType: 'string' },
                timezone: { bsonType: 'string' },
                language: { bsonType: 'string' },
              },
            },
            firstSeenAt: {
              bsonType: 'date',
              description: 'First time device was seen - required',
            },
            lastSeenAt: {
              bsonType: 'date',
              description: 'Last time device was seen - required',
            },
            lastSeenLocation: {
              bsonType: 'object',
              properties: {
                ip: { bsonType: 'string' },
                country: { bsonType: 'string' },
                city: { bsonType: 'string' },
                region: { bsonType: 'string' },
                latitude: { bsonType: 'number' },
                longitude: { bsonType: 'number' },
                timezone: { bsonType: 'string' },
              },
            },
            isTrusted: {
              bsonType: 'bool',
              description: 'Whether device is trusted',
            },
            isActive: {
              bsonType: 'bool',
              description: 'Whether device is still active',
            },
            loginCount: {
              bsonType: 'int',
              description: 'Number of times device was used',
              minimum: 0,
            },
          },
        },
      },
    });

    // Create indexes for userdevices
    console.log('Creating userdevices indexes...');
    await db.collection('userdevices').createIndex(
      { userId: 1, fingerprintHash: 1 },
      { unique: true, name: 'userId_fingerprintHash_unique' }
    );
    await db.collection('userdevices').createIndex(
      { userId: 1, isActive: 1, lastSeenAt: -1 },
      { name: 'userId_active_lastSeen' }
    );
    await db.collection('userdevices').createIndex(
      { fingerprintHash: 1 },
      { name: 'fingerprintHash_index' }
    );

    // 2. Create loginhistories collection
    console.log('Creating loginhistories collection...');
    await db.createCollection('loginhistories', {
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['userId', 'ipAddress', 'loginAt', 'loginStatus'],
          properties: {
            userId: {
              bsonType: 'objectId',
              description: 'Reference to User - required',
            },
            deviceId: {
              bsonType: 'objectId',
              description: 'Reference to UserDevice',
            },
            fingerprint: {
              bsonType: 'string',
              description: 'Browser fingerprint',
            },
            ipAddress: {
              bsonType: 'string',
              description: 'IP address - required',
            },
            location: {
              bsonType: 'object',
              properties: {
                country: { bsonType: 'string' },
                countryCode: { bsonType: 'string' },
                city: { bsonType: 'string' },
                region: { bsonType: 'string' },
                latitude: { bsonType: 'number' },
                longitude: { bsonType: 'number' },
                timezone: { bsonType: 'string' },
                isp: { bsonType: 'string' },
              },
            },
            userAgent: {
              bsonType: 'string',
              description: 'User agent string',
            },
            loginAt: {
              bsonType: 'date',
              description: 'Login timestamp - required',
            },
            loginStatus: {
              bsonType: 'string',
              enum: ['success', 'failed', 'blocked'],
              description: 'Login status - required',
            },
            isNewDevice: {
              bsonType: 'bool',
              description: 'Whether device is new',
            },
            isNewLocation: {
              bsonType: 'bool',
              description: 'Whether location is new',
            },
            fraudFlags: {
              bsonType: 'object',
              properties: {
                impossibleTravel: { bsonType: 'bool' },
                suspiciousIp: { bsonType: 'bool' },
                unusualActivity: { bsonType: 'bool' },
              },
            },
            notificationSent: {
              bsonType: 'bool',
              description: 'Whether notification was sent',
            },
            sessionId: {
              bsonType: 'string',
              description: 'Session identifier',
            },
            expiresAt: {
              bsonType: 'date',
              description: 'TTL expiry timestamp',
            },
          },
        },
      },
    });

    // Create indexes for loginhistories
    console.log('Creating loginhistories indexes...');
    await db.collection('loginhistories').createIndex(
      { userId: 1, loginAt: -1 },
      { name: 'userId_loginAt' }
    );
    await db.collection('loginhistories').createIndex(
      { userId: 1, isNewDevice: 1 },
      { name: 'userId_isNewDevice' }
    );
    await db.collection('loginhistories').createIndex(
      { userId: 1, 'fraudFlags.impossibleTravel': 1 },
      { name: 'userId_impossibleTravel' }
    );
    await db.collection('loginhistories').createIndex(
      { loginStatus: 1, loginAt: -1 },
      { name: 'loginStatus_loginAt' }
    );
    await db.collection('loginhistories').createIndex(
      { ipAddress: 1 },
      { name: 'ipAddress_index' }
    );
    await db.collection('loginhistories').createIndex(
      { sessionId: 1 },
      { name: 'sessionId_index' }
    );

    // Create TTL index for automatic cleanup (180 days)
    console.log('Creating TTL index for loginhistories...');
    await db.collection('loginhistories').createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: 'expiresAt_ttl' }
    );

    // 3. Add lastKnownLocation field to users collection (optional)
    console.log('Updating users collection schema...');
    // Note: MongoDB doesn't require explicit schema updates for new fields
    // The field will be added when first used by the application
    
    console.log('Migration completed successfully!');
  },

  async down(db, client) {
    console.log('Rolling back migration: add-geolocation-tracking...');

    // Drop collections
    console.log('Dropping loginhistories collection...');
    await db.collection('loginhistories').drop().catch(() => {
      console.log('loginhistories collection does not exist, skipping...');
    });

    console.log('Dropping userdevices collection...');
    await db.collection('userdevices').drop().catch(() => {
      console.log('userdevices collection does not exist, skipping...');
    });

    // Note: We don't remove fields from users collection in rollback
    // as existing data should be preserved

    console.log('Rollback completed successfully!');
  },
};
