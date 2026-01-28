import {
  startReconciliationRun,
  buildJsonReport,
  buildCsvReport,
  sendReconciliationAlert,
} from '../services/reconciliation.service.js';
import ApiResponse from '../utils/apiResponse.js';

export async function runReconciliationNow(req, res) {
  try {
    const { provider, since, format = 'json', notify } = req.query;

    const report = await startReconciliationRun({
      provider: provider || undefined,
      since: since ? new Date(since) : undefined,
    });

    const shouldNotify = typeof notify === 'string' && notify.toLowerCase() === 'true';

    if (shouldNotify) {
      await sendReconciliationAlert(report, { reason: 'manual' });
    }

    if (format === 'csv') {
      const csv = buildCsvReport(report);
      const runId = report.run._id.toString();
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="reconciliation-${runId}.csv"`);
      return res.status(200).send(csv);
    }

    const json = buildJsonReport(report);
    return ApiResponse.success(res, json, 'reconciliation.RUN_COMPLETED');
  } catch (error) {
    return ApiResponse.error(
      res,
      error.message || 'Reconciliation failed',
      500,
      'RECONCILIATION_FAILED',
      {
        stack: error.stack,
      }
    );
  }
}

export default {
  runReconciliationNow,
};
