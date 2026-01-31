import fs from 'fs';

/**
 * File signature (magic number) definitions for supported file types
 * These are the byte sequences that appear at the start of files
 */
const FILE_SIGNATURES = {
  // PDF files start with %PDF
  pdf: {
    signatures: [[0x25, 0x50, 0x44, 0x46]], // %PDF
    mimeType: 'application/pdf',
    extension: '.pdf',
  },
  // JPEG files
  jpeg: {
    signatures: [
      [0xff, 0xd8, 0xff, 0xe0], // JFIF format
      [0xff, 0xd8, 0xff, 0xe1], // EXIF format
      [0xff, 0xd8, 0xff, 0xe2], // Canon
      [0xff, 0xd8, 0xff, 0xe3], // Samsung
      [0xff, 0xd8, 0xff, 0xe8], // SPIFF
    ],
    mimeType: 'image/jpeg',
    extension: '.jpg',
  },
  // PNG files
  png: {
    signatures: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]], // PNG signature
    mimeType: 'image/png',
    extension: '.png',
  },
  // DOCX files (ZIP-based Office format)
  docx: {
    signatures: [
      [0x50, 0x4b, 0x03, 0x04], // PK.. (ZIP format)
      [0x50, 0x4b, 0x05, 0x06], // PK.. (empty archive)
      [0x50, 0x4b, 0x07, 0x08], // PK.. (spanned archive)
    ],
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extension: '.docx',
    additionalCheck: true, // Needs content verification
  },
};

/**
 * Dangerous file signatures that should always be blocked
 */
const DANGEROUS_SIGNATURES = {
  // Windows executables
  exe: {
    signatures: [[0x4d, 0x5a]], // MZ
    description: 'Windows executable',
  },
  // ELF executables (Linux)
  elf: {
    signatures: [[0x7f, 0x45, 0x4c, 0x46]], // .ELF
    description: 'Linux executable',
  },
  // Mach-O executables (macOS)
  macho: {
    signatures: [
      [0xfe, 0xed, 0xfa, 0xce], // 32-bit
      [0xfe, 0xed, 0xfa, 0xcf], // 64-bit
      [0xcf, 0xfa, 0xed, 0xfe], // 64-bit reverse
    ],
    description: 'macOS executable',
  },
  // Shell scripts
  shell: {
    signatures: [[0x23, 0x21]], // #!
    description: 'Shell script',
  },
};

/**
 * Check if buffer starts with a specific signature
 */
function matchesSignature(buffer, signature) {
  if (buffer.length < signature.length) {
    return false;
  }

  for (let i = 0; i < signature.length; i++) {
    if (buffer[i] !== signature[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Validate file signature against expected type
 * @param {Buffer} buffer - File buffer to validate
 * @param {string} expectedMimeType - Expected MIME type
 * @returns {Object} Validation result
 */
export async function validateFileSignature(buffer, expectedMimeType) {
  if (!Buffer.isBuffer(buffer)) {
    return {
      valid: false,
      error: 'Invalid buffer provided',
      mimeType: null,
      detectedType: null,
    };
  }

  // Check for dangerous signatures first
  for (const [type, config] of Object.entries(DANGEROUS_SIGNATURES)) {
    for (const signature of config.signatures) {
      if (matchesSignature(buffer, signature)) {
        return {
          valid: false,
          error: `Malicious file detected: ${config.description}`,
          mimeType: null,
          detectedType: type,
          threat: config.description,
        };
      }
    }
  }

  // Find the expected file type configuration
  let expectedType = null;
  for (const [type, config] of Object.entries(FILE_SIGNATURES)) {
    if (config.mimeType === expectedMimeType) {
      expectedType = { type, ...config };
      break;
    }
  }

  if (!expectedType) {
    return {
      valid: false,
      error: 'Unsupported file type',
      mimeType: expectedMimeType,
      detectedType: null,
    };
  }

  // Check if buffer matches expected signatures
  let signatureMatched = false;
  for (const signature of expectedType.signatures) {
    if (matchesSignature(buffer, signature)) {
      signatureMatched = true;
      break;
    }
  }

  if (!signatureMatched) {
    return {
      valid: false,
      error: 'File signature does not match declared type',
      mimeType: expectedMimeType,
      detectedType: null,
      expectedSignature: expectedType.type,
    };
  }

  // Additional checks for DOCX files
  if (expectedType.additionalCheck && expectedType.type === 'docx') {
    const isDOCX = await verifyDOCXContent(buffer);
    if (!isDOCX) {
      return {
        valid: false,
        error: 'File is ZIP but not a valid DOCX document',
        mimeType: expectedMimeType,
        detectedType: 'zip',
      };
    }
  }

  return {
    valid: true,
    error: null,
    mimeType: expectedMimeType,
    detectedType: expectedType.type,
  };
}

/**
 * Verify that a ZIP file is actually a DOCX by checking for Office-specific content
 * @param {Buffer} buffer - File buffer
 * @returns {boolean} True if valid DOCX
 */
async function verifyDOCXContent(buffer) {
  try {
    // Convert buffer to string to search for DOCX-specific content
    const content = buffer.toString('utf8', 0, Math.min(4096, buffer.length));

    // DOCX files contain specific XML namespaces and content types
    const docxIndicators = [
      'word/',
      'document.xml',
      'ContentTypes',
      'wordprocessingml',
      '_rels/.rels',
    ];

    // Check if at least 2 indicators are present (to be reasonably sure)
    let indicatorCount = 0;
    for (const indicator of docxIndicators) {
      if (content.includes(indicator)) {
        indicatorCount++;
      }
    }

    return indicatorCount >= 2;
  } catch (error) {
    // If we can't verify, fail secure
    return false;
  }
}

/**
 * Detect file type from buffer
 * @param {Buffer} buffer - File buffer
 * @returns {Object} Detection result
 */
export function detectFileType(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    return {
      detected: false,
      type: null,
      mimeType: null,
    };
  }

  // Check all supported types
  for (const [type, config] of Object.entries(FILE_SIGNATURES)) {
    for (const signature of config.signatures) {
      if (matchesSignature(buffer, signature)) {
        return {
          detected: true,
          type,
          mimeType: config.mimeType,
          extension: config.extension,
        };
      }
    }
  }

  // Check dangerous types
  for (const [type, config] of Object.entries(DANGEROUS_SIGNATURES)) {
    for (const signature of config.signatures) {
      if (matchesSignature(buffer, signature)) {
        return {
          detected: true,
          type,
          mimeType: null,
          dangerous: true,
          description: config.description,
        };
      }
    }
  }

  return {
    detected: false,
    type: null,
    mimeType: null,
  };
}

/**
 * Validate file buffer against whitelist
 * @param {Buffer} buffer - File buffer
 * @returns {Object} Validation result
 */
export function validateAgainstWhitelist(buffer) {
  const detection = detectFileType(buffer);

  if (!detection.detected) {
    return {
      valid: false,
      error: 'Unknown or unsupported file type',
    };
  }

  if (detection.dangerous) {
    return {
      valid: false,
      error: `Dangerous file type detected: ${detection.description}`,
      threat: detection.description,
    };
  }

  const allowedTypes = ['pdf', 'jpeg', 'png', 'docx'];
  if (!allowedTypes.includes(detection.type)) {
    return {
      valid: false,
      error: `File type ${detection.type} is not in the whitelist`,
      detectedType: detection.type,
    };
  }

  return {
    valid: true,
    type: detection.type,
    mimeType: detection.mimeType,
  };
}

export default {
  validateFileSignature,
  detectFileType,
  validateAgainstWhitelist,
};
