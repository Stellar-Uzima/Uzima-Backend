/* eslint-disable prettier/prettier */
import cron from 'node-cron';
import Outbox from '../models/Outbox.js';
import Record from '../models/Record.js';
import { sha256Hash } from '../utils/hashUtils.js';
import { submitTransaction } from '../services/stellarService.js';
import { withTransaction } from '../utils/withTransaction.js';

const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 5;

function backoffDelaySeconds(attempts) {
  // Exponential backoff with jitter, capped
  const base = Math.min(2 ** attempts, 60);
  const jitter = Math.floor(Math.random() * 5);
  return base + jitter; // seconds
}

async function processStellarAnchorJob(job) {
  // Attempt to claim the job (avoid double processing)
  const claimed = await Outbox.findOneAndUpdate(
    { _id: job._id, status: 'pending' },
    { $set: { status: 'processing' } },
    { new: true }
  );
  if (!claimed) return; // someone else took it

  try {
    const record = await Record.findById(job.payload.recordId);
    if (!record) {
      throw new Error('Record not found for outbox job');
    }

    // Idempotency: if already anchored, just complete the job
    if (record.txHash && record.txHash !== 'pending') {
      await Outbox.updateOne({ _id: job._id }, { $set: { status: 'completed' } });
      return;
    }

    const recordContent = {
      patientName: record.patientName,
      date: record.date,
      diagnosis: record.diagnosis,
      treatment: record.treatment,
      createdBy: record.createdBy.toString(),
    };
    const memoHash = sha256Hash(recordContent);

    // External call - never inside a DB transaction
    const stellarTxHash = await submitTransaction(memoHash);

    // Short DB transaction to update record and complete job
    await withTransaction(async (session) => {
      await Record.updateOne(
        { _id: record._id },
        { $set: { txHash: stellarTxHash } },
        { session }
      );
      await Outbox.updateOne(
        { _id: job._id },
        { $set: { status: 'completed' } },
        { session }
      );
    });
  } catch (err) {
    const attempts = (job.attempts || 0) + 1;
    const nextRunAt = new Date(Date.now() + backoffDelaySeconds(attempts) * 1000);
    const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
    await Outbox.updateOne(
      { _id: job._id },
      { $set: { attempts, nextRunAt, status, lastError: err.message } }
    );
  }
}

async function processOutboxOnce() {
  const now = new Date();
  const jobs = await Outbox.find({
    status: 'pending',
    nextRunAt: { $lte: now },
    type: 'stellar.anchor',
  })
    .sort({ nextRunAt: 1 })
    .limit(BATCH_SIZE)
    .lean();

  for (const job of jobs) {
    await processStellarAnchorJob(job);
  }
}

// Run every minute
cron.schedule('* * * * *', processOutboxOnce, { scheduled: true, timezone: 'UTC' });

export { processOutboxOnce };
