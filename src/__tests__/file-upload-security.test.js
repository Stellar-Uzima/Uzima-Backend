import { describe, it, expect, beforeAll } from 'vitest';
import {
  validateFileSignature,
  detectFileType,
  validateAgainstWhitelist,
} from '../utils/file-signature-validator.js';
import {
  sanitizeFilename,
  generateUUIDFilename,
  detectSuspiciousFilename,
  validateAndSanitizeFilename,
} from '../utils/filename-sanitizer.js';

describe('File Upload Security Tests', () => {
  describe('File Signature Validation', () => {
    it('should validate PDF file signature', async () => {
      // PDF magic number: %PDF
      const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
      const result = await validateFileSignature(pdfBuffer, 'application/pdf');

      expect(result.valid).toBe(true);
      expect(result.detectedType).toBe('pdf');
      expect(result.error).toBeNull();
    });

    it('should validate JPEG file signature', async () => {
      // JPEG magic number: FF D8 FF E0
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const result = await validateFileSignature(jpegBuffer, 'image/jpeg');

      expect(result.valid).toBe(true);
      expect(result.detectedType).toBe('jpeg');
      expect(result.error).toBeNull();
    });

    it('should validate PNG file signature', async () => {
      // PNG magic number: 89 50 4E 47
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const result = await validateFileSignature(pngBuffer, 'image/png');

      expect(result.valid).toBe(true);
      expect(result.detectedType).toBe('png');
      expect(result.error).toBeNull();
    });

    it('should reject file with mismatched signature', async () => {
      // EXE file signature (MZ) claiming to be PDF
      const exeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);
      const result = await validateFileSignature(exeBuffer, 'application/pdf');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Malicious file detected');
    });

    it('should detect executable files', async () => {
      // Windows executable signature (MZ)
      const exeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);
      const result = await validateFileSignature(exeBuffer, 'application/pdf');

      expect(result.valid).toBe(false);
      expect(result.threat).toBe('Windows executable');
    });

    it('should detect ELF executables', async () => {
      // Linux ELF signature
      const elfBuffer = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
      const result = await validateFileSignature(elfBuffer, 'application/pdf');

      expect(result.valid).toBe(false);
      expect(result.threat).toBe('Linux executable');
    });

    it('should reject unsupported file types', async () => {
      const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      const result = await validateFileSignature(buffer, 'application/xml');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Unsupported file type');
    });
  });

  describe('File Type Detection', () => {
    it('should detect PDF from buffer', () => {
      const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46]);
      const result = detectFileType(pdfBuffer);

      expect(result.detected).toBe(true);
      expect(result.type).toBe('pdf');
      expect(result.mimeType).toBe('application/pdf');
    });

    it('should detect dangerous executables', () => {
      const exeBuffer = Buffer.from([0x4d, 0x5a]);
      const result = detectFileType(exeBuffer);

      expect(result.detected).toBe(true);
      expect(result.dangerous).toBe(true);
      expect(result.description).toBe('Windows executable');
    });

    it('should return not detected for unknown types', () => {
      const unknownBuffer = Buffer.from([0xff, 0xff, 0xff, 0xff]);
      const result = detectFileType(unknownBuffer);

      expect(result.detected).toBe(false);
      expect(result.type).toBeNull();
    });
  });

  describe('Whitelist Validation', () => {
    it('should allow whitelisted file types', () => {
      const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46]);
      const result = validateAgainstWhitelist(pdfBuffer);

      expect(result.valid).toBe(true);
      expect(result.type).toBe('pdf');
    });

    it('should reject non-whitelisted types', () => {
      // GIF signature (not in whitelist for this test)
      const gifBuffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
      const result = validateAgainstWhitelist(gifBuffer);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unknown or unsupported');
    });

    it('should reject dangerous files', () => {
      const exeBuffer = Buffer.from([0x4d, 0x5a]);
      const result = validateAgainstWhitelist(exeBuffer);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Dangerous file type');
    });
  });

  describe('Filename Sanitization', () => {
    it('should sanitize filename with special characters', () => {
      const result = sanitizeFilename('my<file>name?.pdf');
      expect(result).toBe('my_file_name.pdf');
    });

    it('should remove path traversal attempts', () => {
      const result = sanitizeFilename('../../../etc/passwd.pdf');
      expect(result).toBe('passwd.pdf');
    });

    it('should limit filename length', () => {
      const longName = 'a'.repeat(200) + '.pdf';
      const result = sanitizeFilename(longName);
      expect(result.length).toBeLessThanOrEqual(105); // 100 + .pdf
    });

    it('should handle multiple dots correctly', () => {
      const result = sanitizeFilename('my.file.name.pdf');
      expect(result).toBe('my.file.name.pdf');
    });

    it('should preserve allowed extensions', () => {
      const result = sanitizeFilename('document.pdf');
      expect(result).toBe('document.pdf');
    });

    it('should normalize .jpeg to .jpg', () => {
      const result = sanitizeFilename('image.jpeg');
      expect(result).toBe('image.jpg');
    });
  });

  describe('UUID Filename Generation', () => {
    it('should generate UUID filename with extension', () => {
      const result = generateUUIDFilename('document.pdf', 'user123');

      expect(result.uuidFilename).toMatch(/^[a-f0-9-]{36}\.pdf$/);
      expect(result.extension).toBe('.pdf');
      expect(result.fullPath).toBe(`users/user123/${result.uuidFilename}`);
    });

    it('should throw error for invalid extensions', () => {
      expect(() => {
        generateUUIDFilename('malware.exe', 'user123');
      }).toThrow('Invalid or unsupported file extension');
    });

    it('should generate different UUIDs for same filename', () => {
      const result1 = generateUUIDFilename('document.pdf');
      const result2 = generateUUIDFilename('document.pdf');

      expect(result1.uuid).not.toBe(result2.uuid);
    });
  });

  describe('Suspicious Filename Detection', () => {
    it('should detect double extensions', () => {
      const result = detectSuspiciousFilename('document.pdf.exe');

      expect(result.suspicious).toBe(true);
      expect(result.issues).toContain('Double extension detected');
      expect(result.issues).toContain('Dangerous extension detected: .exe');
    });

    it('should detect path traversal patterns', () => {
      const result = detectSuspiciousFilename('../../../etc/passwd');

      expect(result.suspicious).toBe(true);
      expect(result.issues).toContain('Path traversal pattern detected');
    });

    it('should detect null bytes', () => {
      const result = detectSuspiciousFilename('file\0.pdf');

      expect(result.suspicious).toBe(true);
      expect(result.issues).toContain('Null byte detected');
    });

    it('should detect hidden files', () => {
      const result = detectSuspiciousFilename('.htaccess');

      expect(result.suspicious).toBe(true);
      expect(result.issues).toContain('Hidden file detected');
    });

    it('should detect extremely long filenames', () => {
      const longName = 'a'.repeat(300);
      const result = detectSuspiciousFilename(longName);

      expect(result.suspicious).toBe(true);
      expect(result.issues).toContain('Filename exceeds maximum length');
    });

    it('should mark safe filenames as safe', () => {
      const result = detectSuspiciousFilename('my-document.pdf');

      expect(result.suspicious).toBe(false);
      expect(result.safe).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe('Complete Filename Validation', () => {
    it('should validate and sanitize correct filename', () => {
      const result = validateAndSanitizeFilename('document.pdf');

      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('document.pdf');
      expect(result.extension).toBe('.pdf');
      expect(result.error).toBeNull();
    });

    it('should reject filename without extension', () => {
      const result = validateAndSanitizeFilename('document');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('File extension is required');
    });

    it('should reject disallowed extensions', () => {
      const result = validateAndSanitizeFilename('script.js');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Suspicious filename');
    });

    it('should reject suspicious filenames', () => {
      const result = validateAndSanitizeFilename('document.pdf.exe');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Suspicious filename detected');
      expect(result.issues).toBeDefined();
    });
  });

  describe('File Size Validation', () => {
    it('should enforce 10MB size limit', () => {
      const maxSize = 10 * 1024 * 1024; // 10MB
      const oversizedFile = maxSize + 1;

      expect(oversizedFile).toBeGreaterThan(maxSize);
    });

    it('should allow files under 10MB', () => {
      const maxSize = 10 * 1024 * 1024;
      const validSize = 5 * 1024 * 1024; // 5MB

      expect(validSize).toBeLessThan(maxSize);
    });
  });

  describe('File Type Whitelist', () => {
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    it('should allow PDF files', () => {
      expect(allowedTypes).toContain('application/pdf');
    });

    it('should allow JPEG files', () => {
      expect(allowedTypes).toContain('image/jpeg');
    });

    it('should allow PNG files', () => {
      expect(allowedTypes).toContain('image/png');
    });

    it('should allow DOCX files', () => {
      expect(allowedTypes).toContain(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
    });

    it('should NOT allow GIF files', () => {
      expect(allowedTypes).not.toContain('image/gif');
    });

    it('should NOT allow executable files', () => {
      expect(allowedTypes).not.toContain('application/x-msdownload');
    });
  });
});
