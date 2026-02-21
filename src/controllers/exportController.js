import { enqueueExport, getJobStatus } from '../queues/exportQueue.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ApiResponse from '../utils/apiResponse.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const exportsDir = path.join(__dirname, '../../exports');

/**
 * Request a data export
 * POST /api/exports/request
 */
export const requestExport = async (req, res) => {
  try {
    const { exportType, filters, format = 'json' } = req.body;
    const userId = req.user?.id; // Assuming authentication middleware sets req.user

    // Validate input
    if (!exportType || !['records', 'users', 'prescriptions'].includes(exportType)) {
      return ApiResponse(
        res,
        400,
        'Invalid export type. Must be one of: records, users, prescriptions'
      );
    }

    if (!['json', 'csv'].includes(format)) {
      return ApiResponse(res, 400, 'Invalid format. Must be json or csv');
    }

    // Enqueue the export job
    const job = await enqueueExport({
      exportType,
      filters: filters || {},
      format,
      userId,
      requestedAt: new Date(),
    });

    return ApiResponse(res, 200, 'Export job queued successfully', {
      jobId: job.id,
      status: 'queued',
    });
  } catch (error) {
    console.error('Error requesting export:', error);
    return ApiResponse(res, 500, 'Failed to queue export job', null, error.message);
  }
};

/**
 * Get export job status
 * GET /api/exports/status/:jobId
 */
export const getExportStatus = async (req, res) => {
  try {
    const { jobId } = req.params;

    const jobStatus = await getJobStatus(jobId);
    if (!jobStatus) {
      return ApiResponse(res, 404, 'Export job not found');
    }

    return ApiResponse(res, 200, 'Export status retrieved successfully', jobStatus);
  } catch (error) {
    console.error('Error getting export status:', error);
    return ApiResponse(res, 500, 'Failed to get export status', null, error.message);
  }
};

/**
 * Download completed export
 * GET /api/exports/download/:jobId
 */
export const downloadExport = async (req, res) => {
  try {
    const { jobId } = req.params;

    const jobStatus = await getJobStatus(jobId);
    if (!jobStatus) {
      return ApiResponse(res, 404, 'Export job not found');
    }

    if (jobStatus.state !== 'completed') {
      return ApiResponse(res, 400, 'Export is not ready for download');
    }

    const { filePath, filename } = jobStatus.data;
    if (!filePath || !fs.existsSync(filePath)) {
      return ApiResponse(res, 404, 'Export file not found');
    }

    // Set headers for file download
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');

    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    fileStream.on('error', error => {
      console.error('Error streaming export file:', error);
      if (!res.headersSent) {
        return ApiResponse(res, 500, 'Failed to download export file');
      }
    });
  } catch (error) {
    console.error('Error downloading export:', error);
    return ApiResponse(res, 500, 'Failed to download export', null, error.message);
  }
};
