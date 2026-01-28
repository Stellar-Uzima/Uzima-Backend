import { generateNonce } from '../config/csp.js';

const cspNonce = (req, res, next) => {
  res.locals.cspNonce = generateNonce();
  next();
};

export default cspNonce;
