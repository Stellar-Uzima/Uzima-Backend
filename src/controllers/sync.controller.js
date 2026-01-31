import Record from '../models/Record.js';

export async function syncRecords(req, res) {
  try {
    const records = req.body;

    if (!Array.isArray(records)) {
      return res.status(400).json({ error: 'Payload must be an array of records' });
    }

    // Validate each record has required fields
    const invalidRecords = records.filter(
      record =>
        !record.clientUUID ||
        !record.syncTimestamp ||
        !record.patientName ||
        !record.diagnosis ||
        !record.treatment ||
        !record.createdBy
    );

    if (invalidRecords.length > 0) {
      return res.status(400).json({
        error: 'Invalid records found',
        details:
          'Each record must contain clientUUID, syncTimestamp, patientName, diagnosis, treatment, and createdBy',
      });
    }

    // Convert syncTimestamp strings to Date objects
    const processedRecords = records.map(record => ({
      ...record,
      syncTimestamp: new Date(record.syncTimestamp),
    }));

    // Find existing records by clientUUID and syncTimestamp
    const existingRecords = await Record.find({
      $or: processedRecords.map(record => ({
        clientUUID: record.clientUUID,
        syncTimestamp: record.syncTimestamp,
      })),
    })
      .select('clientUUID syncTimestamp')
      .lean();

    // Create a Set of existing record identifiers for quick lookup
    const existingIdentifiers = new Set(
      existingRecords.map(record => `${record.clientUUID}-${record.syncTimestamp.getTime()}`)
    );

    // Filter out records that already exist
    const newRecords = processedRecords.filter(
      record => !existingIdentifiers.has(`${record.clientUUID}-${record.syncTimestamp.getTime()}`)
    );

    if (newRecords.length === 0) {
      return res.json({
        synced: [],
        message: 'No new records to sync',
      });
    }

    // Insert new records in a transaction (all-or-nothing)
    const session = await Record.startSession();
    let syncedIds = [];

    try {
      await session.withTransaction(async () => {
        const insertedRecords = await Record.insertMany(newRecords, {
          session,
          ordered: true, // enforce atomicity
        });
        syncedIds = insertedRecords.map(record => record._id);
      });
    } catch (error) {
      // Any error aborts the transaction; report failure
      throw error;
    } finally {
      await session.endSession();
    }

    return res.json({
      synced: syncedIds,
      message: `Successfully synced ${syncedIds.length} records`,
    });
  } catch (error) {
    console.error('Sync error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to sync records',
    });
  }
}
