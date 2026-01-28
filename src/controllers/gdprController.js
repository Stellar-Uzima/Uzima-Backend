import User from '../models/User.js';
import Record from '../models/Record.js';
import GDPRRequest from '../models/GDPRRequest.js';
import transactionLog from '../models/transactionLog.js';
import ApiResponse from '../utils/apiResponse.js';
import { withTransaction } from '../utils/withTransaction.js';
import { exportUserData, scheduleUserDeletion } from '../jobs/gdprJobs.js';

const gdprController = {
  /**
   * Export user data in JSON or CSV format
   * GET /users/:id/export-data
   */
  exportUserData: async (req, res) => {
    try {
      const { id } = req.params;
      const { format = 'json' } = req.query;
      const requesterId = req.user.id;

      // Verify the requester has permission to export this user's data
      if (req.user.role !== 'admin' && req.user.id !== id) {
        return ApiResponse.error(res, "Insufficient permissions to export this user's data", 403);
      }

      // Check if user exists and is not deleted
      const user = await User.findOne({ _id: id, deletedAt: null });
      if (!user) {
        return ApiResponse.error(res, 'User not found', 404);
      }

      // Create GDPR request record
      const gdprRequest = new GDPRRequest({
        userId: id,
        requestType: 'export',
        requestedBy: requesterId,
        exportFormat: format,
        requestReason: 'User data export request',
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent') || 'Unknown',
      });

      await gdprRequest.save();

      // Log the request
      await transactionLog.create({
        action: 'gdpr_export_requested',
        resource: 'user',
        resourceId: id,
        performedBy: requesterId,
        details: `Data export requested for user ${id} in ${format} format`,
        timestamp: new Date(),
      });

      // Start background job for data export
      await exportUserData(gdprRequest._id);

      return ApiResponse.success(
        res,
        {
          requestId: gdprRequest._id,
          status: 'processing',
          estimatedCompletion: '5-10 minutes',
        },
        'Data export request submitted successfully'
      );
    } catch (error) {
      console.error('GDPR Export Error:', error);
      return ApiResponse.error(res, 'Failed to process export request', 500);
    }
  },

  /**
   * Get export status and download link
   * GET /users/:id/export-status/:requestId
   */
  getExportStatus: async (req, res) => {
    try {
      const { id, requestId } = req.params;
      const requesterId = req.user.id;

      // Verify permissions
      if (req.user.role !== 'admin' && req.user.id !== id) {
        return ApiResponse.error(res, 'Insufficient permissions', 403);
      }

      const gdprRequest = await GDPRRequest.findOne({
        _id: requestId,
        userId: id,
        requestType: 'export',
      });

      if (!gdprRequest) {
        return ApiResponse.error(res, 'Export request not found', 404);
      }

      return ApiResponse.success(
        res,
        {
          requestId: gdprRequest._id,
          status: gdprRequest.status,
          exportFormat: gdprRequest.exportFormat,
          downloadUrl: gdprRequest.downloadUrl,
          createdAt: gdprRequest.createdAt,
          processingStartedAt: gdprRequest.processingStartedAt,
          processingCompletedAt: gdprRequest.processingCompletedAt,
          errorMessage: gdprRequest.errorMessage,
        },
        'Export status retrieved successfully'
      );
    } catch (error) {
      console.error('GDPR Status Error:', error);
      return ApiResponse.error(res, 'Failed to retrieve export status', 500);
    }
  },

  /**
   * Request user data deletion
   * DELETE /users/:id/erase
   */
  requestUserDeletion: async (req, res) => {
    try {
      const { id } = req.params;
      const { reason = 'User requested data deletion' } = req.body;
      const requesterId = req.user.id;

      // Verify the requester has permission to delete this user's data
      if (req.user.role !== 'admin' && req.user.id !== id) {
        return ApiResponse.error(res, "Insufficient permissions to delete this user's data", 403);
      }

      // Check if user exists and is not already deleted
      const user = await User.findOne({ _id: id, deletedAt: null });
      if (!user) {
        return ApiResponse.error(res, 'User not found or already deleted', 404);
      }

      // Check if there's already a pending deletion request
      const existingRequest = await GDPRRequest.findOne({
        userId: id,
        requestType: 'delete',
        status: { $in: ['pending', 'processing'] },
      });

      if (existingRequest) {
        return ApiResponse.error(res, 'Deletion request already pending for this user', 409);
      }

      // Create GDPR request record
      const gdprRequest = new GDPRRequest({
        userId: id,
        requestType: 'delete',
        requestedBy: requesterId,
        requestReason: reason,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent') || 'Unknown',
      });

      await gdprRequest.save();

      // Log the request
      await transactionLog.create({
        action: 'gdpr_deletion_requested',
        resource: 'user',
        resourceId: id,
        performedBy: requesterId,
        details: `Data deletion requested for user ${id}. Reason: ${reason}`,
        timestamp: new Date(),
      });

      // Start background job for data deletion
      await scheduleUserDeletion(gdprRequest._id);

      return ApiResponse.success(
        res,
        {
          requestId: gdprRequest._id,
          status: 'processing',
          message:
            'Data deletion request submitted. User will be soft-deleted immediately and permanently deleted after 30 days.',
        },
        'Data deletion request submitted successfully'
      );
    } catch (error) {
      console.error('GDPR Deletion Error:', error);
      return ApiResponse.error(res, 'Failed to process deletion request', 500);
    }
  },

  /**
   * Get deletion status
   * GET /users/:id/deletion-status/:requestId
   */
  getDeletionStatus: async (req, res) => {
    try {
      const { id, requestId } = req.params;
      const requesterId = req.user.id;

      // Verify permissions
      if (req.user.role !== 'admin' && req.user.id !== id) {
        return ApiResponse.error(res, 'Insufficient permissions', 403);
      }

      const gdprRequest = await GDPRRequest.findOne({
        _id: requestId,
        userId: id,
        requestType: 'delete',
      });

      if (!gdprRequest) {
        return ApiResponse.error(res, 'Deletion request not found', 404);
      }

      return ApiResponse.success(
        res,
        {
          requestId: gdprRequest._id,
          status: gdprRequest.status,
          deletionScheduledAt: gdprRequest.deletionScheduledAt,
          deletionCompletedAt: gdprRequest.deletionCompletedAt,
          createdAt: gdprRequest.createdAt,
          processingStartedAt: gdprRequest.processingStartedAt,
          processingCompletedAt: gdprRequest.processingCompletedAt,
          errorMessage: gdprRequest.errorMessage,
        },
        'Deletion status retrieved successfully'
      );
    } catch (error) {
      console.error('GDPR Status Error:', error);
      return ApiResponse.error(res, 'Failed to retrieve deletion status', 500);
    }
  },

  /**
   * Admin dashboard - Get all GDPR requests
   * GET /admin/gdpr-requests
   */
  getAllGDPRRequests: async (req, res) => {
    try {
      const { page = 1, limit = 20, status, requestType } = req.query;
      const skip = (page - 1) * limit;

      // Build query
      const query = {};
      if (status) query.status = status;
      if (requestType) query.requestType = requestType;

      const requests = await GDPRRequest.find(query)
        .populate('userId', 'username email role')
        .populate('requestedBy', 'username email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit));

      const total = await GDPRRequest.countDocuments(query);

      return ApiResponse.success(
        res,
        {
          requests,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / limit),
          },
        },
        'GDPR requests retrieved successfully'
      );
    } catch (error) {
      console.error('GDPR Admin Error:', error);
      return ApiResponse.error(res, 'Failed to retrieve GDPR requests', 500);
    }
  },

  /**
   * Admin dashboard - Get GDPR request details
   * GET /admin/gdpr-requests/:requestId
   */
  getGDPRRequestDetails: async (req, res) => {
    try {
      const { requestId } = req.params;

      const request = await GDPRRequest.findById(requestId)
        .populate('userId', 'username email role createdAt')
        .populate('requestedBy', 'username email role');

      if (!request) {
        return ApiResponse.error(res, 'GDPR request not found', 404);
      }

      return ApiResponse.success(res, request, 'GDPR request details retrieved successfully');
    } catch (error) {
      console.error('GDPR Details Error:', error);
      return ApiResponse.error(res, 'Failed to retrieve GDPR request details', 500);
    }
  },
};

export default gdprController;
