import cron from 'node-cron';
import { startReconciliationRun, sendReconciliationAlert } from '../services/reconciliation.service.js';

export async function runDailyReconciliation() {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24 hours
    const report = await startReconciliationRun({ since });

    const { summary } = report;
    const discrepancies =
      (summary?.orphanedWebhookCount || 0) +
      (summary?.missingWebhookCount || 0) +
      (summary?.amountMismatchCount || 0) +
      (summary?.otherErrorCount || 0);

    if (discrepancies > 0) {
      await sendReconciliationAlert(report, { reason: 'daily' });
    }

    // eslint-disable-next-line no-console
    console.log('Daily reconciliation run completed', {
      runId: report.run._id.toString(),
      discrepancies,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Daily reconciliation run failed:', err.message);
  }
}

// Schedule at 01:00 UTC every day
cron.schedule('0 1 * * *', () => {
  runDailyReconciliation().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Scheduled reconciliation error:', err.message);
  });
}, { scheduled: true, timezone: 'UTC' });