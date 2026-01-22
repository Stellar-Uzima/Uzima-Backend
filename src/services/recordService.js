/* eslint-disable prettier/prettier */
// src/service/recordService.js
import Record from '../models/Record.js';
import Outbox from '../models/Outbox.js';
import { sha256Hash } from '../utils/hashUtils.js';
import { fetchMemoFromTransaction, submitTransaction } from './stellarService.js';
import { withTransaction } from '../utils/withTransaction.js';
import { notifyUser, notifyResource } from '../wsServer.js';

// Create record and enqueue Stellar anchoring via Outbox pattern + optional real-time notification
export async function saveAndAnchorRecord(recordData) {
  let record;

  await withTransaction(async (session) => {
    record = new Record({ ...recordData, txHash: 'pending' });
    await record.save({ session });

    // Outbox job - worker will compute the hash and submit to Stellar
    await Outbox.create(
      [
        {
          type: 'stellar.anchor',
          payload: { recordId: record._id.toString() },
          idempotencyKey: record._id.toString(),
          status: 'pending',
        },
      ],
      { session }
    );
  });

  // Real-time "record created" notification (with tx pending)
  const safePayload = {
    _id: record._id,
    createdBy: record.createdBy,
    txHash: record.txHash,
    event: 'recordCreated',
  };
  notifyUser(record.createdBy, 'recordCreated', safePayload);
  notifyResource(record._id, 'recordCreated', safePayload);

  // Return 202-like response; tx will be updated once Stellar anchoring completes
  return { record, txHash: 'pending' };
}

export async function verifyRecord(recordId) {
  const record = await Record.findById(recordId).lean();
  if (!record) throw new Error('Record not found');
  if (!record.txHash || record.txHash === 'pending') return false;

  const onChainMemo = await fetchMemoFromTransaction(record.txHash);

  const recordContent = {
    patientName: record.patientName,
    date: record.date,
    diagnosis: record.diagnosis,
    treatment: record.treatment,
    createdBy: record.createdBy.toString(),
  };

  const localHash = sha256Hash(recordContent);

  return localHash === onChainMemo;
}
