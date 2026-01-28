export const buildSessionMetadata = req => ({
  ip: req.ip,
  userAgent: req.headers['user-agent'] ?? 'unknown',
  loginAt: new Date().toISOString(),
});
