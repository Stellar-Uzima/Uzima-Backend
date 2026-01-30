import express from 'express';
import { Pool } from 'pg';
import { workQueue } from './queue';

export function adminRouter(pool) {
  const router = express.Router();

  // list DLQ items (with pagination)
  router.get('/dlq', async (req, res) => {
    const limit = Math.min(100, Number(req.query.limit ?? 50));
    const offset = Number(req.query.offset ?? 0);
    const rows = await pool.query(
      `SELECT * FROM dlq_items ORDER BY failed_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json({ success: true, data: rows.rows });
  });

  // inspect single item
  router.get('/dlq/:id', async (req, res) => {
    const { id } = req.params;
    const row = await pool.query(`SELECT * FROM dlq_items WHERE id=$1`, [id]);
    if (!row.rowCount) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: row.rows[0] });
  });

  // requeue after inspection
  router.post('/dlq/:id/requeue', async (req, res) => {
    const { id } = req.params;
    const row = await pool.query(`SELECT * FROM dlq_items WHERE id=$1`, [id]);
    if (!row.rowCount) return res.status(404).json({ success: false, message: 'Not found' });
    const item = row.rows[0];
    // Add back to queue (maintain attempts metadata or reset)
    await workQueue.add('requeued-job', item.payload, {
      attempts: Number(process.env.MAX_ATTEMPTS ?? 5),
      backoff: { type: 'exponential', delay: Number(process.env.BACKOFF_BASE_MS ?? 1000) },
    });
    await pool.query(`UPDATE dlq_items SET requeued=true, requeued_at=now() WHERE id=$1`, [id]);
    res.json({ success: true, message: 'Requeued' });
  });

  return router;
}
