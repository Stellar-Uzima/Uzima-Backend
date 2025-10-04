import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to protect Swagger documentation in production
 * Requires basic authentication to access /docs
 */
export function swaggerAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const env = process.env.NODE_ENV;

  // Allow in development and staging without auth
  if (env === 'development' || env === 'staging') {
    return next();
  }

  // Require basic auth in production
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Swagger Documentation"');
    res.status(401).json({
      statusCode: 401,
      message: 'Authentication required to access API documentation',
    });
    return;
  }

  try {
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    const validUsername = process.env.SWAGGER_USER || 'admin';
    const validPassword = process.env.SWAGGER_PASSWORD || 'changeme';

    if (username === validUsername && password === validPassword) {
      return next();
    }

    res.setHeader('WWW-Authenticate', 'Basic realm="Swagger Documentation"');
    res.status(401).json({
      statusCode: 401,
      message: 'Invalid credentials',
    });
  } catch (error) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Swagger Documentation"');
    res.status(401).json({
      statusCode: 401,
      message: 'Invalid authentication format',
    });
  }
}

/**
 * Alternative: IP whitelist middleware for additional security
 */
export function ipWhitelistMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const allowedIPs = (process.env.SWAGGER_ALLOWED_IPS || '127.0.0.1').split(',');
  const clientIP = req.ip || req.socket.remoteAddress || '';

  if (allowedIPs.includes(clientIP) || allowedIPs.includes('*')) {
    return next();
  }

  res.status(403).json({
    statusCode: 403,
    message: 'Access to documentation denied from your IP address',
  });
}

/**
 * Combined middleware: Basic auth + IP whitelist
 */
export function combinedSwaggerSecurity(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // First check IP whitelist
  const allowedIPs = (process.env.SWAGGER_ALLOWED_IPS || '').split(',').filter(Boolean);
  
  if (allowedIPs.length > 0) {
    const clientIP = req.ip || req.socket.remoteAddress || '';
    if (!allowedIPs.includes(clientIP) && !allowedIPs.includes('*')) {
      return res.status(403).json({
        statusCode: 403,
        message: 'Access denied from your IP address',
      });
    }
  }

  // Then check basic auth
  swaggerAuthMiddleware(req, res, next);
}