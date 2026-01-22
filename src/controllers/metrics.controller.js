import Vital from '../models/Vital.js';
import redisClient from '../config/redis.js';

function parseDateRange(req) {
  const { from, to, patientId, bucket } = req.query;
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - 365 * 24 * 60 * 60 * 1000);
  const bucketSize = ['day', 'week', 'month'].includes(bucket) ? bucket : 'day';
  return { start, end, patientId, bucketSize };
}

function getCacheKey({ patientId, start, end, bucketSize }) {
  const pid = patientId || 'all';
  return `vitals:metrics:${pid}:${bucketSize}:${start.toISOString()}:${end.toISOString()}`;
}

export async function getVitalsMetrics(req, res) {
  try {
    const { start, end, patientId, bucketSize } = parseDateRange(req);
    const cacheKey = getCacheKey({ patientId, start, end, bucketSize });

    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const match = {
      recordedAt: { $gte: start, $lte: end },
    };
    if (patientId) match.patientId = new (await import('mongoose')).default.Types.ObjectId(patientId);

    const dateTrunc = bucketSize === 'month' ? '%Y-%m-01' : bucketSize === 'week' ? '%G-%V-1' : '%Y-%m-%d';

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: {
            $dateToString: { format: dateTrunc, date: '$recordedAt' },
          },
          avgHeartRate: { $avg: '$heartRate' },
          avgSystolic: { $avg: '$systolic' },
          avgDiastolic: { $avg: '$diastolic' },
          avgTemperatureC: { $avg: '$temperatureC' },
          avgSpo2: { $avg: '$spo2' },
          avgRespiratoryRate: { $avg: '$respiratoryRate' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const results = await Vital.aggregate(pipeline);

    // Heatmap helpful projection (e.g., by hour-of-day vs day-of-week)
    const heatmap = await Vital.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            dow: { $dayOfWeek: '$recordedAt' },
            hour: { $hour: '$recordedAt' },
          },
          avgHeartRate: { $avg: '$heartRate' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.dow': 1, '_id.hour': 1 } },
    ]);

    const payload = { bucket: bucketSize, range: { from: start, to: end }, series: results, heatmap };
    await redisClient.set(cacheKey, JSON.stringify(payload), { EX: 60 });
    return res.json(payload);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('getVitalsMetrics error', err);
    return res.status(500).json({ error: 'Failed to compute metrics' });
  }
}


