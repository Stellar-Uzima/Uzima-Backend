import cache from './cacheService.js';
import { creditScoreKey } from '../utils/cacheKeys.js';

// Placeholder: compute score (simulate expensive op)
async function computeCreditScore(userId) {
  // Replace with real implementation when available
  // Here we simulate work
  await new Promise(r => setTimeout(r, 50));
  return { userId, score: 700 + Math.floor(Math.random() * 100) };
}

export async function getCreditScoreCached(userId, ttlSeconds = 600) {
  const key = creditScoreKey(userId);
  const cached = await cache.getJson(key);
  if (cached) return cached;
  const computed = await computeCreditScore(userId);
  await cache.setJson(key, computed, ttlSeconds);
  return computed;
}

export async function invalidateCreditScore(userId) {
  try { await cache.del(creditScoreKey(userId)); } catch {}
}


