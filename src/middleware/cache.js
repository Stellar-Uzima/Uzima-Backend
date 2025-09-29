import cache from '../services/cacheService.js';

// Simple read-through cache middleware for GET endpoints
// buildKey: (req) => string
// ttlSeconds: number
export const cacheGet = (buildKey, ttlSeconds = 300) => {
  return async (req, res, next) => {
    try {
      const key = buildKey(req);
      if (!key) return next();
      const cached = await cache.getJson(key);
      if (cached) {
        return res.status(200).json({ success: true, data: cached, cached: true });
      }

      // Hook res.json to populate cache after handler runs
      const originalJson = res.json.bind(res);
      res.json = async (body) => {
        try {
          if (body && (body.data || Array.isArray(body))) {
            const payload = body.data ?? body;
            await cache.setJson(key, payload, ttlSeconds);
          }
        } catch {}
        return originalJson(body);
      };

      next();
    } catch (err) {
      next();
    }
  };
};


