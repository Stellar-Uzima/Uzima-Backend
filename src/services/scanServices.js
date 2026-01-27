const Queue = require('bull');
const axios = require('axios');
const fileService = require('./fileService');

// Create Redis-backed queue for virus scanning
const scanQueue = new Queue('virus-scan', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
  },
});

// Queue a file for virus scanning
async function queueVirusScan(fileId) {
  await scanQueue.add(
    { fileId },
    {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      timeout: 300000, // 5 minutes
    }
  );
}

// Process virus scan jobs
scanQueue.process(async job => {
  const { fileId } = job.data;

  try {
    const file = await File.findById(fileId);

    if (!file) {
      throw new Error('File not found');
    }

    // Update status
    file.status = 'scanning';
    await file.save();

    // Perform virus scan
    const scanResult = await performVirusScan(file);

    if (scanResult.infected) {
      // File is infected - quarantine it
      file.status = 'quarantined';
      file.scanResult = {
        scannedAt: new Date(),
        scanner: scanResult.scanner,
        threats: scanResult.threats,
        details: scanResult.details,
      };

      // Move to quarantine bucket/prefix
      await fileService.moveToQuarantine(file.key);

      // Notify admin (implement notification service)
      await notifyAdminOfThreat(file);
    } else {
      // File is clean
      file.status = 'clean';
      file.scanResult = {
        scannedAt: new Date(),
        scanner: scanResult.scanner,
        threats: [],
        details: scanResult.details,
      };
    }

    await file.save();

    return { success: true, status: file.status };
  } catch (err) {
    console.error('Virus scan failed:', err);

    // Update file status to indicate scan failure
    const file = await File.findById(fileId);
    if (file) {
      file.status = 'infected'; // Fail secure
      await file.save();
    }

    throw err;
  }
});

// Perform virus scan with file signature validation
async function performVirusScan(file) {
  // In production, integrate with ClamAV, VirusTotal, or cloud antivirus API
  // Example: ClamAV REST API, AWS S3 Object Lambda, etc.

  if (process.env.CLAMAV_API_URL) {
    try {
      // Example ClamAV integration
      const response = await axios.post(
        `${process.env.CLAMAV_API_URL}/scan`,
        {
          key: file.key,
          bucket: process.env.S3_BUCKET_NAME,
        },
        { timeout: 60000 }
      );

      return {
        infected: response.data.infected,
        scanner: 'ClamAV',
        threats: response.data.threats || [],
        details: response.data,
      };
    } catch (err) {
      console.error('ClamAV scan error:', err);
      throw err;
    }
  }

  // Fallback: Enhanced file validation with signature checking
  // 1. Check for dangerous file extensions
  const suspiciousExtensions = [
    '.exe',
    '.bat',
    '.cmd',
    '.scr',
    '.js',
    '.vbs',
    '.jar',
    '.sh',
    '.ps1',
    '.app',
    '.dmg',
  ];
  const fileExt = file.filename.toLowerCase().match(/\.[^.]+$/)?.[0];

  if (suspiciousExtensions.includes(fileExt)) {
    return {
      infected: true,
      scanner: 'signature-validation',
      threats: ['suspicious-extension'],
      details: { reason: 'Dangerous file extension detected' },
    };
  }

  // 2. Check for double extensions (e.g., file.pdf.exe)
  const doubleExtRegex = /\.[a-zA-Z0-9]+\.[a-zA-Z0-9]+$/;
  if (doubleExtRegex.test(file.filename)) {
    return {
      infected: true,
      scanner: 'signature-validation',
      threats: ['double-extension'],
      details: { reason: 'Double extension detected - possible malware attempt' },
    };
  }

  // 3. Check for path traversal attempts
  if (file.filename.includes('..') || file.filename.includes('/') || file.filename.includes('\\')) {
    return {
      infected: true,
      scanner: 'signature-validation',
      threats: ['path-traversal'],
      details: { reason: 'Path traversal pattern detected' },
    };
  }

  // 4. Verify file signature was validated
  if (file.signatureValidationResult && !file.signatureValidationResult.valid) {
    return {
      infected: true,
      scanner: 'signature-validation',
      threats: ['invalid-signature', file.signatureValidationResult.threat].filter(Boolean),
      details: {
        reason: file.signatureValidationResult.error || 'File signature validation failed',
        detectedType: file.signatureValidationResult.detectedType,
      },
    };
  }

  // Simulate scan delay
  await new Promise(resolve => setTimeout(resolve, 2000));

  return {
    infected: false,
    scanner: 'signature-validation',
    threats: [],
    details: { message: 'No threats detected' },
  };
}

async function notifyAdminOfThreat(file) {
  // Implement admin notification (email, Slack, etc.)
  console.log('SECURITY ALERT: Infected file detected', {
    fileId: file._id,
    userId: file.userId,
    filename: file.filename,
    threats: file.scanResult.threats,
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  await scanQueue.close();
  process.exit(0);
});

module.exports = {
  queueVirusScan,
  scanQueue,
};
