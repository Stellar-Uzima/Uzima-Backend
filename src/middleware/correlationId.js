import { v4 as uuidv4 } from 'uuid';

// Middleware to attach a request ID to each request for distributed tracing
const correlationIdMiddleware = (req, res, next) => {
  const headerKey = 'x-request-id';
  const requestId = req.headers[headerKey] || uuidv4();
  req.requestId = requestId;
  req.correlationId = requestId; // Keep for backward compatibility
  res.setHeader(headerKey, requestId);
  next();
};

export default correlationIdMiddleware;
