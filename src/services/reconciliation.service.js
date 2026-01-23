import mongoose from 'mongoose';
import Payment from '../models/Payment.js';
import PaymentWebhook from '../models/PaymentWebhook.js';
import ReconciliationRun from '../models/ReconciliationRun.js';
import ReconciliationItem from '../models/ReconciliationItem.js';
import mailer from '../services/email.Service.js';

const { ObjectId } = mongoose.Types;

/**
 * Run a reconciliation between payment webhooks and payment records.
 * @param {Object} options
 * @param {string} [options.provider]
 * @param {Date|string} [options.since]
 * @returns {Promise<{ run: any, summary: any, matched: any[], orphanedWebhooks: any[], missingWebhooks: any[], amountMismatches: any[] }>}
 */
export async function startReconciliationRun({ provider, since } = {}) {
  const run = await ReconciliationRun.create({
    provider: provider || null,
    status: 'running',
    startedAt: new Date(),
  });

  try {
    const sinceDate = since ? new Date(since) : null;

    const [
      webhookSide,
      paymentSide,
    ] = await Promise.all([
      aggregateWebhooksToPayments({ provider, since: sinceDate }),
      aggregatePaymentsToWebhooks({ provider, since: sinceDate }),
    ]);

    const {
      matched,
      orphanedWebhooks,
      amountMismatches,
      totalWebhooks,
    } = webhookSide;

    const { missingWebhooks, totalPayments } = paymentSide;

    // Persist discrepancy items using ReconciliationItem
    await createReconciliationItems({
      runId: run._id,
      provider,
      orphanedWebhooks,
      missingWebhooks,
      amountMismatches,
    });

    // Update run document with summary + details (small samples only)
    run.summary = {
      totalPayments,
      totalWebhooks,
      matchedCount: matched.length,
      orphanedWebhookCount: orphanedWebhooks.length,
      missingWebhookCount: missingWebhooks.length,
      amountMismatchCount: amountMismatches.length,
      otherErrorCount: 0,
    };

    // To keep document size reasonable, only store a small sample of rows
    const sample = (arr, limit = 50) => (arr.length > limit ? arr.slice(0, limit) : arr);

    run.matched = sample(
      matched.map((m) => ({
        transactionId: m.transactionId,
        provider: m.provider,
        paymentId: m.paymentId,
        webhookId: m.webhookId,
      })),
      100
    );

    run.unmatched = {
      orphanedWebhooks: sample(
        orphanedWebhooks.map((w) => ({
          webhookId: w._id,
          transactionId: w.transactionId,
          provider: w.provider,
        })),
        100
      ),
      missingWebhooks: sample(
        missingWebhooks.map((p) => ({
          paymentId: p._id,
          transactionId: p.transactionId,
          provider: p.provider,
        })),
        100
      ),
      amountMismatches: sample(
        amountMismatches.map((m) => ({
          paymentId: m.paymentId,
          webhookId: m.webhookId,
          transactionId: m.transactionId,
          provider: m.provider,
          paymentAmount: m.paymentAmount,
          webhookAmount: m.webhookAmount,
        })),
        100
      ),
    };

    run.status = 'completed';
    run.completedAt = new Date();
    await run.save();

    return {
      run,
      summary: run.summary,
      matched,
      orphanedWebhooks,
      missingWebhooks,
      amountMismatches,
    };
  } catch (err) {
    run.status = 'failed';
    run.completedAt = new Date();
    run.errors = run.errors || [];
    run.errors.push({ message: err.message, details: { stack: err.stack } });
    await run.save();
    throw err;
  }
}

async function aggregateWebhooksToPayments({ provider, since }) {
  const matchStage = {};
  if (provider) matchStage.provider = provider;
  if (since) matchStage.receivedAt = { $gte: since };

  const pipeline = [
    { $match: matchStage },
    {
      $lookup: {
        from: Payment.collection.name,
        let: { provider: '$provider', transactionId: '$transactionId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$provider', '$$provider'] },
                  { $eq: ['$transactionId', '$$transactionId'] },
                ],
              },
            },
          },
        ],
        as: 'payments',
      },
    },
  ];

  const results = await PaymentWebhook.aggregate(pipeline).allowDiskUse(true);

  const matched = [];
  const orphanedWebhooks = [];
  const amountMismatches = [];

  for (const row of results) {
    const payment = row.payments[0];
    if (!payment) {
      orphanedWebhooks.push(row);
      continue;
    }

    const sameAmount =
      typeof row.amount === 'number' &&
      typeof payment.amount === 'number' &&
      row.amount === payment.amount;
    const sameCurrency =
      row.currency && payment.currency && row.currency === payment.currency;

    if (sameAmount && sameCurrency) {
      matched.push({
        provider: row.provider,
        transactionId: row.transactionId,
        paymentId: payment._id,
        webhookId: row._id,
      });
    } else {
      amountMismatches.push({
        provider: row.provider,
        transactionId: row.transactionId,
        paymentId: payment._id,
        webhookId: row._id,
        paymentAmount: payment.amount,
        webhookAmount: row.amount,
        paymentCurrency: payment.currency,
        webhookCurrency: row.currency,
      });
    }
  }

  return {
    totalWebhooks: results.length,
    matched,
    orphanedWebhooks,
    amountMismatches,
  };
}

async function aggregatePaymentsToWebhooks({ provider, since }) {
  const matchStage = {};
  if (provider) matchStage.provider = provider;
  if (since) matchStage.createdAt = { $gte: since };

  const pipeline = [
    { $match: matchStage },
    {
      $lookup: {
        from: PaymentWebhook.collection.name,
        let: { provider: '$provider', transactionId: '$transactionId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$provider', '$$provider'] },
                  { $eq: ['$transactionId', '$$transactionId'] },
                ],
              },
            },
          },
        ],
        as: 'webhooks',
      },
    },
  ];

  const results = await Payment.aggregate(pipeline).allowDiskUse(true);

  const missingWebhooks = [];

  for (const row of results) {
    if (!row.webhooks || row.webhooks.length === 0) {
      missingWebhooks.push(row);
    }
  }

  return {
    totalPayments: results.length,
    missingWebhooks,
  };
}

async function createReconciliationItems({
  runId,
  provider,
  orphanedWebhooks,
  missingWebhooks,
  amountMismatches,
}) {
  const items = [];

  for (const w of orphanedWebhooks) {
    items.push({
      runId: new ObjectId(runId),
      providerId: provider || w.provider,
      localTransactionId: null,
      type: 'MISSING_LOCAL',
      details: {
        webhookId: w._id,
        transactionId: w.transactionId,
      },
    });
  }

  for (const p of missingWebhooks) {
    items.push({
      runId: new ObjectId(runId),
      providerId: provider || p.provider,
      localTransactionId: p._id,
      type: 'MISSING_PROVIDER',
      details: {
        transactionId: p.transactionId,
      },
    });
  }

  for (const m of amountMismatches) {
    items.push({
      runId: new ObjectId(runId),
      providerId: provider || m.provider,
      localTransactionId: m.paymentId,
      type: 'AMOUNT_MISMATCH',
      details: {
        transactionId: m.transactionId,
        paymentAmount: m.paymentAmount,
        webhookAmount: m.webhookAmount,
        paymentCurrency: m.paymentCurrency,
        webhookCurrency: m.webhookCurrency,
      },
    });
  }

  if (items.length > 0) {
    await ReconciliationItem.insertMany(items, { ordered: false });
  }
}

export function buildJsonReport(report) {
  return {
    run: {
      id: report.run._id,
      provider: report.run.provider,
      status: report.run.status,
      startedAt: report.run.startedAt,
      completedAt: report.run.completedAt,
      summary: report.summary,
    },
    discrepancies: {
      orphanedWebhooks: report.orphanedWebhooks,
      missingWebhooks: report.missingWebhooks,
      amountMismatches: report.amountMismatches,
    },
    matched: report.matched,
  };
}

export function buildCsvReport(report) {
  const rows = [];

  for (const w of report.orphanedWebhooks) {
    rows.push({
      type: 'ORPHANED_WEBHOOK',
      provider: w.provider,
      transactionId: w.transactionId,
      paymentId: '',
      webhookId: w._id?.toString() || '',
      paymentAmount: '',
      webhookAmount: w.amount ?? '',
      paymentStatus: '',
      eventType: w.eventType || '',
    });
  }

  for (const p of report.missingWebhooks) {
    rows.push({
      type: 'MISSING_WEBHOOK',
      provider: p.provider,
      transactionId: p.transactionId,
      paymentId: p._id?.toString() || '',
      webhookId: '',
      paymentAmount: p.amount ?? '',
      webhookAmount: '',
      paymentStatus: p.status || '',
      eventType: '',
    });
  }

  for (const m of report.amountMismatches) {
    rows.push({
      type: 'AMOUNT_MISMATCH',
      provider: m.provider,
      transactionId: m.transactionId,
      paymentId: m.paymentId?.toString() || '',
      webhookId: m.webhookId?.toString() || '',
      paymentAmount: m.paymentAmount ?? '',
      webhookAmount: m.webhookAmount ?? '',
      paymentStatus: '',
      eventType: '',
    });
  }

  const header = [
    'type',
    'provider',
    'transactionId',
    'paymentId',
    'webhookId',
    'paymentAmount',
    'webhookAmount',
    'paymentStatus',
    'eventType',
  ];

  const csvLines = [header.join(',')];

  for (const row of rows) {
    const values = header.map((key) => {
      const value = row[key];
      if (value === null || value === undefined) return '';
      const str = String(value);
      // Simple CSV escaping
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    });
    csvLines.push(values.join(','));
  }

  return csvLines.join('\n');
}

export async function sendReconciliationAlert(report, { reason } = {}) {
  const recipients = process.env.RECONCILIATION_ALERT_EMAILS;
  if (!recipients) {
    // eslint-disable-next-line no-console
    console.log('Reconciliation discrepancies detected but RECONCILIATION_ALERT_EMAILS is not set');
    return;
  }

  const { summary } = report;
  const totalDiscrepancies =
    (summary?.orphanedWebhookCount || 0) +
    (summary?.missingWebhookCount || 0) +
    (summary?.amountMismatchCount || 0) +
    (summary?.otherErrorCount || 0);

  const subject = `Payment reconciliation run ${report.run._id} - ${totalDiscrepancies} issues`;

  const html = `
    <h1>Payment Reconciliation Report</h1>
    <p>Run ID: ${report.run._id}</p>
    <p>Provider: ${report.run.provider || 'all'}</p>
    <p>Status: ${report.run.status}</p>
    <p>Reason: ${reason || 'unspecified'}</p>
    <h2>Summary</h2>
    <ul>
      <li>Total payments: ${summary?.totalPayments || 0}</li>
      <li>Total webhooks: ${summary?.totalWebhooks || 0}</li>
      <li>Matched: ${summary?.matchedCount || 0}</li>
      <li>Orphaned webhooks: ${summary?.orphanedWebhookCount || 0}</li>
      <li>Missing webhooks: ${summary?.missingWebhookCount || 0}</li>
      <li>Amount mismatches: ${summary?.amountMismatchCount || 0}</li>
    </ul>
  `;

  const to = recipients.split(',').map((e) => e.trim()).filter(Boolean);

  try {
    await Promise.all(
      to.map((email) => mailer.sendMail(email, subject, html))
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to send reconciliation alert email(s):', err.message);
  }
}

export default {
  startReconciliationRun,
  buildJsonReport,
  buildCsvReport,
  sendReconciliationAlert,
};
