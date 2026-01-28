import session from 'express-session';
import RedisStore from 'connect-redis';
import redisClient from './redis.js';

export const sessionMiddleware = session({
  store: new RedisStore({
    client: redisClient,
    prefix: 'session:',
  }),
  name: 'drip.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true, // refresh TTL on activity
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000, // ✅ 24h
  },
});
