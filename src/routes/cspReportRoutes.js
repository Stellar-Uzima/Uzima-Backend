import express from 'express';

const router = express.Router();

router.post('/csp-report', express.json({ type: 'application/csp-report' }), (req, res) => {
  const report = req.body['csp-report'] || req.body;
  console.warn('[CSP Violation]', JSON.stringify(report, null, 2));
  res.status(204).end();
});

export default router;
