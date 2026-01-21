import jwt from 'jsonwebtoken';

const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
const REFRESH_TOKEN_TTL = parseInt(process.env.REFRESH_TOKEN_TTL_MS || `${7 * 24 * 60 * 60 * 1000}`, 10); // 7 days ms

export const generateAccessToken = (user, twoFactorVerified = false) => {
  return jwt.sign(
    {
      id: user._id,
      username: user.username,
      role: user.role,
      twoFactorEnabled: user.twoFactor?.enabled || false,
      twoFactorVerified,
    },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: ACCESS_TOKEN_TTL }
  );
};

export const verifyAccessToken = token => {
  return jwt.verify(token, process.env.JWT_SECRET || 'secret');
};

export const generateRefreshTokenPayload = user => {
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL);
  const payload = {
    sub: String(user._id),
    expMs: expiresAt.getTime(),
  };
  return { payload, expiresAt };
};

export default generateAccessToken;
