import { BadRequestException } from '@nestjs/common';

/**
 * Validates an uploaded file's type and size before it's persisted and
 * associated with an entity, so unauthorized file types/oversized
 * uploads never reach storage.
 */
export const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

export const DEFAULT_ALLOWED_MIME_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
];

/**
 * Maps file extensions (without leading dot, lowercase) to the set of
 * MIME types that are valid for that extension.
 */
export const EXTENSION_TO_MIME: Record<string, string[]> = {
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  webp: ['image/webp'],
  pdf: ['application/pdf'],
};

/**
 * Magic-number signatures used to detect the true content type of a
 * file from its binary buffer.  The first matching signature wins.
 */
interface MagicSignature {
  mimeType: string;
  /**
   * The first N bytes of the buffer are compared byte-for-byte against
   * `prefix`.  If they match, the buffer is identified as `mimeType`.
   */
  prefix: number[];
}

const MAGIC_SIGNATURES: MagicSignature[] = [
  { mimeType: 'image/png', prefix: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mimeType: 'image/jpeg', prefix: [0xff, 0xd8, 0xff] },
  { mimeType: 'application/pdf', prefix: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  // RIFF....WEBP  — webp files start with RIFF then 4 bytes of length then WEBP
  { mimeType: 'image/webp', prefix: [0x52, 0x49, 0x46, 0x46] },
];

export interface UploadCandidate {
  mimetype: string;
  size: number;
}

export interface UploadValidationOptions {
  allowedMimeTypes?: readonly string[];
  maxBytes?: number;
  /** When provided, the file extension is also validated against the allowlist. */
  filename?: string;
  /**
   * When provided (a Buffer), the true content type is detected from the
   * magic number and cross-checked against the declared mimetype.
   */
  buffer?: Buffer;
}

/**
 * Validates a legacy {@link UploadCandidate} (declared mimetype + size only).
 *
 * @deprecated Prefer {@link validateUploadWithDetection} which also checks
 * the file extension and magic-number content type.
 */
export function validateUpload(
  file: UploadCandidate,
  options: {
    allowedMimeTypes?: readonly string[];
    maxBytes?: number;
  } = {}
): void {
  const allowedMimeTypes = options.allowedMimeTypes ?? DEFAULT_ALLOWED_MIME_TYPES;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_UPLOAD_BYTES;

  if (!allowedMimeTypes.includes(file.mimetype)) {
    throw new BadRequestException(`Unsupported file type: ${file.mimetype}`);
  }

  if (file.size > maxBytes) {
    throw new BadRequestException(`File exceeds maximum allowed size of ${maxBytes} bytes`);
  }
}

/**
 * Extracts a lowercase extension (without the dot) from a filename.
 * Returns an empty string when the filename has no extension.
 */
export function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot < 0 || dot === filename.length - 1) return '';
  return filename.slice(dot + 1).toLowerCase();
}

/**
 * Detects the true MIME type of a buffer by reading its magic number
 * (first few bytes).  Returns `null` when the signature is not recognised.
 */
export function detectContentType(buffer: Buffer): string | null {
  if (!buffer || buffer.length === 0) return null;

  for (const sig of MAGIC_SIGNATURES) {
    if (buffer.length < sig.prefix.length) continue;
    let match = true;
    for (let i = 0; i < sig.prefix.length; i++) {
      if (buffer[i] !== sig.prefix[i]) {
        match = false;
        break;
      }
    }
    if (match) {
      // Special-case webp: bytes 8-11 must be "WEBP"
      if (sig.mimeType === 'image/webp') {
        if (buffer.length < 12) return null;
        const tag = buffer.toString('ascii', 8, 12);
        if (tag !== 'WEBP') return null;
      }
      return sig.mimeType;
    }
  }

  return null;
}

/**
 * Comprehensive upload validation that checks **all three** acceptance
 * criteria required by issue #1592:
 *
 * 1. **File size** — must not exceed `maxBytes`.
 * 2. **Extension** — must be in the extension allowlist derived from
 *    `allowedMimeTypes` (when `filename` is provided).
 * 3. **Detected content type** — the magic number of `buffer` must match
 *    an allowed MIME type **and** must agree with the declared mimetype
 *    (when `buffer` is provided).
 *
 * Rejected files produce a safe {@link BadRequestException} and are never
 * persisted — callers must call this *before* writing to storage.
 */
export function validateUploadWithDetection(
  file: { mimetype: string; size: number; filename?: string; buffer?: Buffer },
  options: UploadValidationOptions = {}
): void {
  const allowedMimeTypes = options.allowedMimeTypes ?? DEFAULT_ALLOWED_MIME_TYPES;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
  const filename = options.filename ?? file.filename;
  const buffer = options.buffer ?? file.buffer;

  // 1. Size check
  if (file.size > maxBytes) {
    throw new BadRequestException(`File exceeds maximum allowed size of ${maxBytes} bytes`);
  }

  // 2. Declared MIME type check
  if (!allowedMimeTypes.includes(file.mimetype)) {
    throw new BadRequestException(`Unsupported file type: ${file.mimetype}`);
  }

  // 3. Extension check (when filename is available)
  if (filename) {
    const ext = getExtension(filename);
    if (!ext || !(ext in EXTENSION_TO_MIME)) {
      throw new BadRequestException(`Unsupported file extension: .${ext || 'none'}`);
    }
    const validMimes = EXTENSION_TO_MIME[ext];
    if (!validMimes.includes(file.mimetype)) {
      throw new BadRequestException(
        `File extension .${ext} does not match declared type ${file.mimetype}`
      );
    }
  }

  // 4. Magic-number content type detection (when buffer is available)
  if (buffer) {
    const detected = detectContentType(buffer);
    if (!detected) {
      throw new BadRequestException('File content could not be verified');
    }
    if (!allowedMimeTypes.includes(detected)) {
      throw new BadRequestException(`Unsupported detected file type: ${detected}`);
    }
    if (detected !== file.mimetype) {
      throw new BadRequestException(
        `File content type mismatch: declared ${file.mimetype} but detected ${detected}`
      );
    }
  }
}
