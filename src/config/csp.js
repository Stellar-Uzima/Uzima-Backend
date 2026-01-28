import crypto from 'crypto';

export const generateNonce = () => crypto.randomBytes(16).toString('base64');

export const getCspDirectives = nonce => ({
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", `'nonce-${nonce}'`],
  styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  fontSrc: ["'self'", 'https://fonts.gstatic.com'],
  imgSrc: ["'self'", 'data:', 'https:'],
  connectSrc: [
    "'self'",
    'https://horizon.stellar.org',
    'https://horizon-testnet.stellar.org',
    'wss:',
  ],
  objectSrc: ["'none'"],
  frameAncestors: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  reportUri: '/api/csp-report',
});
