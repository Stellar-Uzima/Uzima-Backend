// File upload validation and idempotent background jobs. Closes #1592, #1595.
const ALLOWED = {
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.pdf': ['application/pdf'],
};
const MAX_BYTES = 5 * 1024 * 1024;

// Detect the real type from magic bytes instead of trusting the client header.
function detectType(buf) {
  if (buf.slice(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (buf.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return 'image/png';
  if (buf.slice(0, 4).toString() === '%PDF') return 'application/pdf';
  return null;
}

function validateUpload({ originalname = '', size = 0, buffer }) {
  const ext = originalname.slice(originalname.lastIndexOf('.')).toLowerCase();
  if (!ALLOWED[ext]) return { ok: false, message: 'File type not allowed' };
  if (size > MAX_BYTES) return { ok: false, message: 'File too large' };
  if (!buffer || !ALLOWED[ext].includes(detectType(buffer))) return { ok: false, message: 'File content does not match type' };
  return { ok: true };
}

// Runs a side-effecting job once per stable operation id; retries return the first result.
function makeIdempotent(job, done = new Map()) {
  return async (operationId, ...args) => {
    if (done.has(operationId)) return done.get(operationId);
    const result = await job(...args);
    done.set(operationId, result);
    return result;
  };
}

module.exports = { ALLOWED, MAX_BYTES, detectType, validateUpload, makeIdempotent };
