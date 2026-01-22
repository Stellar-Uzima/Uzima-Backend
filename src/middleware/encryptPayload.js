import { encrypt } from '../utils/encryptionUtils.js';

const FIELDS_TO_ENCRYPT = ['diagnosis', 'treatment', 'history'];

function encryptPayload(req, res, next) {
  try {
    if (req.body) {
      FIELDS_TO_ENCRYPT.forEach(field => {
        if (req.body[field] && typeof req.body[field] === 'string') {
          req.body[field] = encrypt(req.body[field]);
        }
      });

      // Handle bulk operations
      if (req.body.records && Array.isArray(req.body.records)) {
        req.body.records.forEach(record => {
          FIELDS_TO_ENCRYPT.forEach(field => {
            if (record[field] && typeof record[field] === 'string') {
              record[field] = encrypt(record[field]);
            }
          });
        });
      }
    }
    next();
  } catch (err) {
    console.error('Encryption failed:', err.message);
    res.status(500).json({
      success: false,
      message: 'Encryption error',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
}

export default encryptPayload;
