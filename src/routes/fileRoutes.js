import express from 'express';
import { authenticate } from '../middleware/auth.js';
import fileService from '../services/fileService.js';
import { queueVirusScan } from '../services/scanServices.js';
import { validateFileSignature } from '../utils/file-signature-validator.js';
import { validateAndSanitizeFilename } from '../utils/filename-sanitizer.js';
import fileUploadValidatorController from '../controllers/file-upload-validator.controller.js';
import File from '../models/file.js';
import ApiResponse from '../utils/apiResponse.js';

const router = express.Router();

// POST /files/signed-upload - Generate signed upload URL
router.post('/signed-upload', authenticate, async (req, res) => {
  try {
    const { filename, contentType, size } = req.body;

    // Validation
    if (!filename || !contentType || !size) {
      return ApiResponse.validationError(res, 'Missing required fields', {
        body: [{ message: 'filename, contentType, and size are required' }],
      });
    }

    // File size limit (10MB)
    const maxSize = 10 * 1024 * 1024;
    if (size > maxSize) {
      return ApiResponse.validationError(res, 'File too large', {
        size: [
          { field: 'size', message: `File size exceeds maximum of ${maxSize / (1024 * 1024)}MB` },
        ],
      });
    }

    // Allowed content types (strict whitelist)
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!allowedTypes.includes(contentType)) {
      return ApiResponse.validationError(res, 'File type not allowed', {
        contentType: [
          { field: 'contentType', message: 'Only PDF, JPG, PNG, DOCX files are allowed' },
        ],
      });
    }

    // Validate filename
    const filenameValidation = validateAndSanitizeFilename(filename);
    if (!filenameValidation.valid) {
      return ApiResponse.validationError(res, 'Invalid filename', {
        filename: [{ field: 'filename', message: filenameValidation.error }],
      });
    }

    // Generate signed URL
    const { uploadUrl, key, expiresIn } = await fileService.generateSignedUploadUrl(
      req.userId,
      filename,
      contentType,
      size
    );

    // Create file record
    const file = new File({
      userId: req.userId,
      key,
      filename,
      contentType,
      size,
      status: 'pending',
    });

    await file.save();

    res.json({
      uploadUrl,
      fileId: file._id,
      key,
      expiresIn,
      message: 'Upload the file using PUT request to the uploadUrl',
    });
  } catch (err) {
    console.error('Error generating signed upload URL:', err);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

// POST /files/:fileId/confirm - Confirm upload completion and trigger scan
router.post('/:fileId/confirm', authenticate, async (req, res) => {
  try {
    const file = await File.findOne({
      _id: req.params.fileId,
      userId: req.userId,
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (file.status !== 'pending') {
      return res.status(400).json({ error: 'File already confirmed' });
    }

    // Update status and queue for scanning
    file.status = 'scanning';
    await file.save();

    // Queue virus scan job
    await queueVirusScan(file._id);

    res.json({
      fileId: file._id,
      status: file.status,
      message: 'File uploaded successfully and queued for scanning',
    });
  } catch (err) {
    console.error('Error confirming upload:', err);
    res.status(500).json({ error: 'Failed to confirm upload' });
  }
});

// GET /files/:fileId - Get file metadata
router.get('/:fileId', authenticate, async (req, res) => {
  try {
    const file = await File.findOne({
      _id: req.params.fileId,
      userId: req.userId,
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json({
      id: file._id,
      filename: file.filename,
      contentType: file.contentType,
      size: file.size,
      status: file.status,
      uploadedAt: file.uploadedAt,
      scanResult: file.scanResult,
    });
  } catch (err) {
    console.error('Error fetching file:', err);
    res.status(500).json({ error: 'Failed to fetch file' });
  }
});

// GET /files/:fileId/download - Get signed download URL
router.get('/:fileId/download', authenticate, async (req, res) => {
  try {
    const file = await File.findOne({
      _id: req.params.fileId,
      userId: req.userId,
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check file status
    if (file.status === 'infected' || file.status === 'quarantined') {
      return res.status(403).json({
        error: 'File is quarantined due to security concerns',
        status: file.status,
      });
    }

    if (file.status === 'scanning' || file.status === 'pending') {
      return res.status(202).json({
        error: 'File is still being processed',
        status: file.status,
        message: 'Please try again in a few moments',
      });
    }

    // Generate signed download URL
    const downloadUrl = await fileService.generateSignedDownloadUrl(file.key);

    // Update last accessed timestamp
    file.lastAccessedAt = new Date();
    await file.save();

    res.json({
      downloadUrl,
      filename: file.filename,
      contentType: file.contentType,
      expiresIn: fileService.downloadTTL,
    });
  } catch (err) {
    console.error('Error generating download URL:', err);
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
});

// GET /files - List user's files
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const query = { userId: req.userId };
    if (status) {
      query.status = status;
    }

    const files = await File.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .select('-__v');

    const total = await File.countDocuments(query);

    res.json({
      files,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('Error listing files:', err);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// DELETE /files/:fileId - Delete file
router.delete('/:fileId', authenticate, async (req, res) => {
  try {
    const file = await File.findOne({
      _id: req.params.fileId,
      userId: req.userId,
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete from S3
    await fileService.deleteFile(file.key);

    // Delete from database
    await file.deleteOne();

    res.json({ message: 'File deleted successfully' });
  } catch (err) {
    console.error('Error deleting file:', err);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// POST /uploads/validate - Pre-upload validation
router.post('/validate', authenticate, fileUploadValidatorController.validatePreUpload);

// GET /uploads/guidelines - Get upload guidelines
router.get('/guidelines', authenticate, fileUploadValidatorController.getUploadGuidelines);

export default router;
