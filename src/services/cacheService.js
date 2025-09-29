import redisClient from '../config/redis.js';

const DEFAULT_TTL_SECONDS = 300; // 5 minutes

export class CacheService {
  constructor(client = redisClient) {
    this.client = client;
  }

  async getJson(key) {
    try {
      const raw = await this.client.get(key);
      if (!raw) {
        // metrics: miss
        try { await this.client.incr('cache:misses'); } catch {}
        return null;
      }
      try { await this.client.incr('cache:hits'); } catch {}
      return JSON.parse(raw);
    } catch (err) {
      // Fallback on cache errors
      return null;
    }
  }

  async setJson(key, value, ttlSeconds = DEFAULT_TTL_SECONDS) {
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds > 0) {
        await this.client.setEx(key, ttlSeconds, serialized);
      } else {
        await this.client.set(key, serialized);
      }
      return true;
    } catch (err) {
      return false;
    }
  }

  async del(key) {
    try {
      await this.client.del(key);
    } catch {}
  }

  async mdel(prefix) {
    try {
      const iter = this.client.scanIterator({ MATCH: `${prefix}*`, COUNT: 100 });
      const keys = [];
      for await (const k of iter) keys.push(k);
      if (keys.length) await this.client.del(keys);
      return keys.length;
    } catch {
      return 0;
    }
  }

  async metrics() {
    try {
      const [hits, misses] = await this.client.mGet(['cache:hits', 'cache:misses']);
      const h = Number(hits || 0);
      const m = Number(misses || 0);
      const total = h + m;
      const hitRate = total > 0 ? h / total : 0;
      return { hits: h, misses: m, total, hitRate };
    } catch {
      return { hits: 0, misses: 0, total: 0, hitRate: 0 };
    }
  }
}

const cacheService = new CacheService();
export default cacheService;


