import {
  validateUpload,
  validateUploadWithDetection,
  detectContentType,
  getExtension,
  DEFAULT_MAX_UPLOAD_BYTES,
  DEFAULT_ALLOWED_MIME_TYPES,
  EXTENSION_TO_MIME,
} from './file-upload-validator.util';
import { BadRequestException } from '@nestjs/common';

// Helper: build a valid PNG buffer (8-byte signature + filler)
function makePngBuffer(extra: number = 100): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, Buffer.alloc(extra)]);
}

// Helper: build a valid JPEG buffer (3-byte signature + filler)
function makeJpegBuffer(extra: number = 100): Buffer {
  const sig = Buffer.from([0xff, 0xd8, 0xff]);
  return Buffer.concat([sig, Buffer.alloc(extra)]);
}

// Helper: build a valid PDF buffer (5-byte signature + filler)
function makePdfBuffer(extra: number = 100): Buffer {
  const sig = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]);
  return Buffer.concat([sig, Buffer.alloc(extra)]);
}

// Helper: build a valid WebP buffer (RIFF header + 4 bytes length + WEBP tag + filler)
function makeWebpBuffer(extra: number = 100): Buffer {
  const riff = Buffer.from([0x52, 0x49, 0x46, 0x46]); // RIFF
  const size = Buffer.alloc(4); // file size placeholder
  const webp = Buffer.from('WEBP', 'ascii'); // bytes 8-11
  return Buffer.concat([riff, size, webp, Buffer.alloc(extra)]);
}

describe('file-upload-validator.util', () => {
  // -----------------------------------------------------------------------
  // getExtension
  // -----------------------------------------------------------------------
  describe('getExtension', () => {
    it('extracts a lowercase extension from a filename', () => {
      expect(getExtension('photo.PNG')).toBe('png');
      expect(getExtension('photo.JPG')).toBe('jpg');
      expect(getExtension('document.pdf')).toBe('pdf');
    });

    it('returns empty string for files with no extension', () => {
      expect(getExtension('noextension')).toBe('');
    });

    it('returns empty string for files ending with a dot', () => {
      expect(getExtension('ends.')).toBe('');
    });

    it('handles multiple dots correctly', () => {
      expect(getExtension('archive.tar.gz')).toBe('gz');
    });
  });

  // -----------------------------------------------------------------------
  // detectContentType
  // -----------------------------------------------------------------------
  describe('detectContentType', () => {
    it('detects PNG from magic number', () => {
      expect(detectContentType(makePngBuffer())).toBe('image/png');
    });

    it('detects JPEG from magic number', () => {
      expect(detectContentType(makeJpegBuffer())).toBe('image/jpeg');
    });

    it('detects PDF from magic number', () => {
      expect(detectContentType(makePdfBuffer())).toBe('application/pdf');
    });

    it('detects WebP from magic number', () => {
      expect(detectContentType(makeWebpBuffer())).toBe('image/webp');
    });

    it('returns null for unrecognised content', () => {
      expect(detectContentType(Buffer.from('hello world'))).toBeNull();
    });

    it('returns null for empty buffer', () => {
      expect(detectContentType(Buffer.alloc(0))).toBeNull();
    });

    it('returns null when buffer is undefined', () => {
      expect(detectContentType(undefined as any)).toBeNull();
    });

    it('returns null for RIFF buffer that is not WebP', () => {
      // RIFF header but bytes 8-11 are not "WEBP"
      const riff = Buffer.from([0x52, 0x49, 0x46, 0x46]);
      const size = Buffer.alloc(4);
      const notWebp = Buffer.from('WAVE', 'ascii'); // WAV audio, not WebP
      const buf = Buffer.concat([riff, size, notWebp, Buffer.alloc(10)]);
      expect(detectContentType(buf)).toBeNull();
    });

    it('returns null for a truncated RIFF/WebP buffer', () => {
      // Only 4 bytes RIFF — not enough to check WEBP tag
      const buf = Buffer.from([0x52, 0x49, 0x46, 0x46]);
      expect(detectContentType(buf)).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // validateUpload (legacy)
  // -----------------------------------------------------------------------
  describe('validateUpload (legacy)', () => {
    it('passes for a valid file within limits', () => {
      expect(() => validateUpload({ mimetype: 'image/png', size: 1024 })).not.toThrow();
    });

    it('throws BadRequestException for unsupported mime type', () => {
      expect(() => validateUpload({ mimetype: 'image/gif', size: 1024 })).toThrow(
        BadRequestException
      );
    });

    it('throws BadRequestException for oversized file', () => {
      expect(() =>
        validateUpload({
          mimetype: 'image/png',
          size: DEFAULT_MAX_UPLOAD_BYTES + 1,
        })
      ).toThrow(BadRequestException);
    });

    it('respects custom allowedMimeTypes', () => {
      expect(() =>
        validateUpload({ mimetype: 'image/gif', size: 1024 }, { allowedMimeTypes: ['image/gif'] })
      ).not.toThrow();
    });

    it('respects custom maxBytes', () => {
      expect(() =>
        validateUpload({ mimetype: 'image/png', size: 2048 }, { maxBytes: 1024 })
      ).toThrow(BadRequestException);
    });
  });

  // -----------------------------------------------------------------------
  // validateUploadWithDetection
  // -----------------------------------------------------------------------
  describe('validateUploadWithDetection', () => {
    it('passes for a valid PNG with matching extension and buffer', () => {
      expect(() =>
        validateUploadWithDetection({
          mimetype: 'image/png',
          size: 108,
          filename: 'test.png',
          buffer: makePngBuffer(100),
        })
      ).not.toThrow();
    });

    it('passes for a valid JPEG with matching extension and buffer', () => {
      expect(() =>
        validateUploadWithDetection({
          mimetype: 'image/jpeg',
          size: 103,
          filename: 'photo.jpg',
          buffer: makeJpegBuffer(100),
        })
      ).not.toThrow();
    });

    it('passes for a valid PDF with matching extension and buffer', () => {
      expect(() =>
        validateUploadWithDetection({
          mimetype: 'application/pdf',
          size: 105,
          filename: 'doc.pdf',
          buffer: makePdfBuffer(100),
        })
      ).not.toThrow();
    });

    it('passes for a valid WebP with matching extension and buffer', () => {
      expect(() =>
        validateUploadWithDetection({
          mimetype: 'image/webp',
          size: 112,
          filename: 'img.webp',
          buffer: makeWebpBuffer(100),
        })
      ).not.toThrow();
    });

    it('passes when buffer is omitted (metadata-only validation)', () => {
      expect(() =>
        validateUploadWithDetection({
          mimetype: 'image/png',
          size: 1024,
          filename: 'test.png',
        })
      ).not.toThrow();
    });

    it('passes when filename is omitted but buffer is present', () => {
      expect(() =>
        validateUploadWithDetection({
          mimetype: 'image/png',
          size: 108,
          buffer: makePngBuffer(100),
        })
      ).not.toThrow();
    });

    // --- Size rejection ---
    it('throws BadRequestException for oversized file', () => {
      expect(() =>
        validateUploadWithDetection({
          mimetype: 'image/png',
          size: DEFAULT_MAX_UPLOAD_BYTES + 1,
          filename: 'big.png',
          buffer: makePngBuffer(100),
        })
      ).toThrow(BadRequestException);
    });

    // --- Declared MIME type rejection ---
    it('throws BadRequestException for unsupported declared mime type', () => {
      expect(() =>
        validateUploadWithDetection({
          mimetype: 'image/gif',
          size: 1024,
          filename: 'test.gif',
          buffer: Buffer.alloc(100),
        })
      ).toThrow(BadRequestException);
    });

    // --- Extension rejection ---
    it('throws BadRequestException for unsupported extension', () => {
      expect(() =>
        validateUploadWithDetection({
          mimetype: 'image/png',
          size: 1024,
          filename: 'test.gif',
          buffer: makePngBuffer(100),
        })
      ).toThrow(BadRequestException);
    });

    it('throws BadRequestException when extension does not match declared mime', () => {
      expect(() =>
        validateUploadWithDetection({
          mimetype: 'image/png',
          size: 1024,
          filename: 'test.jpg',
          buffer: makePngBuffer(100),
        })
      ).toThrow(BadRequestException);
    });

    it('throws BadRequestException for filename with no extension', () => {
      expect(() =>
        validateUploadWithDetection({
          mimetype: 'image/png',
          size: 1024,
          filename: 'noextension',
          buffer: makePngBuffer(100),
        })
      ).toThrow(BadRequestException);
    });

    // --- Magic number detection rejection ---
    it('throws BadRequestException when buffer content does not match declared mime', () => {
      expect(() =>
        validateUploadWithDetection({
          mimetype: 'image/png',
          size: 103,
          filename: 'test.png',
          buffer: makeJpegBuffer(100), // actually JPEG bytes
        })
      ).toThrow(BadRequestException);
    });

    it('throws BadRequestException when detected type is not in allowlist', () => {
      // RIFF header but not WebP — detectContentType returns null
      const riff = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
      ]);
      expect(() =>
        validateUploadWithDetection({
          mimetype: 'image/webp',
          size: 12,
          filename: 'test.webp',
          buffer: riff,
        })
      ).toThrow(BadRequestException);
    });

    it('throws BadRequestException when buffer content is unrecognised', () => {
      expect(() =>
        validateUploadWithDetection({
          mimetype: 'image/png',
          size: 11,
          filename: 'test.png',
          buffer: Buffer.from('hello world'),
        })
      ).toThrow(BadRequestException);
    });

    it('throws BadRequestException for empty buffer', () => {
      expect(() =>
        validateUploadWithDetection({
          mimetype: 'image/png',
          size: 0,
          filename: 'test.png',
          buffer: Buffer.alloc(0),
        })
      ).toThrow(BadRequestException);
    });

    // --- Custom options ---
    it('respects custom allowedMimeTypes (subset of defaults)', () => {
      expect(() =>
        validateUploadWithDetection(
          {
            mimetype: 'image/png',
            size: 108,
            filename: 'test.png',
            buffer: makePngBuffer(100),
          },
          { allowedMimeTypes: ['image/png'] }
        )
      ).not.toThrow();
    });

    it('rejects allowed mime type not in extension allowlist', () => {
      // image/gif has no entry in EXTENSION_TO_MIME so it's rejected
      expect(() =>
        validateUploadWithDetection(
          {
            mimetype: 'image/gif',
            size: 1024,
            filename: 'test.gif',
            buffer: Buffer.from('GIF89a'),
          },
          { allowedMimeTypes: ['image/gif'] }
        )
      ).toThrow(BadRequestException);
    });

    it('respects custom maxBytes', () => {
      expect(() =>
        validateUploadWithDetection(
          {
            mimetype: 'image/png',
            size: 2048,
            filename: 'test.png',
            buffer: makePngBuffer(100),
          },
          { maxBytes: 1024 }
        )
      ).toThrow(BadRequestException);
    });

    // --- Constants ---
    it('DEFAULT_ALLOWED_MIME_TYPES contains expected types', () => {
      expect(DEFAULT_ALLOWED_MIME_TYPES).toContain('image/png');
      expect(DEFAULT_ALLOWED_MIME_TYPES).toContain('image/jpeg');
      expect(DEFAULT_ALLOWED_MIME_TYPES).toContain('image/webp');
      expect(DEFAULT_ALLOWED_MIME_TYPES).toContain('application/pdf');
    });

    it('EXTENSION_TO_MIME maps all expected extensions', () => {
      expect(Object.keys(EXTENSION_TO_MIME)).toEqual(
        expect.arrayContaining(['png', 'jpg', 'jpeg', 'webp', 'pdf'])
      );
    });
  });
});
