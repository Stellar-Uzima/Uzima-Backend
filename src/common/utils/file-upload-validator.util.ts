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

export interface UploadCandidate {
  mimetype: string;
  size: number;
}

export function validateUpload(
  file: UploadCandidate,
  options: {
    allowedMimeTypes?: readonly string[];
    maxBytes?: number;
  } = {},
): void {
  const allowedMimeTypes = options.allowedMimeTypes ?? DEFAULT_ALLOWED_MIME_TYPES;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_UPLOAD_BYTES;

  if (!allowedMimeTypes.includes(file.mimetype)) {
    throw new Error(`Unsupported file type: ${file.mimetype}`);
  }

  if (file.size > maxBytes) {
    throw new Error(
      `File exceeds maximum allowed size of ${maxBytes} bytes`,
    );
  }
}
