/* eslint-disable prettier/prettier */
/* eslint-disable no-undef */
// src/utils/hashUtils.js
import crypto from 'crypto';

export function sha256Hash(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

