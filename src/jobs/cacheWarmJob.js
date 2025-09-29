import cache from '../services/cacheService.js';
import { userListKey, recordListKey } from '../utils/cacheKeys.js';
import User from '../models/User.js';
import Record from '../models/Record.js';

// Simple cache warm job: prefill first page lists
export async function warmCaches() {
  try {
    const users = await User.find({ deletedAt: null }).limit(20);
    const userData = users.map(u => ({ id: u._id, username: u.username, email: u.email, role: u.role }));
    await cache.setJson(userListKey({ includeDeleted: false, page: 1, limit: 20 }), userData, 300);
  } catch {}

  try {
    const records = await Record.find({}).limit(20);
    const recordData = records.map(r => ({ id: r._id, patientName: r.patientName, diagnosis: r.diagnosis }));
    await cache.setJson(recordListKey({ page: 1, limit: 20 }), recordData, 180);
  } catch {}
}

// Optional periodic warm
export function scheduleCacheWarm(intervalMs = 5 * 60 * 1000) {
  setInterval(() => {
    warmCaches().catch(() => {});
  }, intervalMs);
}


