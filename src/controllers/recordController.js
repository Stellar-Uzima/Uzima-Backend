import Record from '../models/Record.js';
import ApiResponse from '../utils/apiResponse.js';
import transactionLog from '../models/transactionLog.js';
import { withTransaction } from '../utils/withTransaction.js';
import { notifyUser, notifyResource } from '../wsServer.js';

const IPFS_GATEWAY = 'https://ipfs.io/ipfs/';

const recordController = {
  // Get all records
  getAllRecords: async (req, res) => {
    try {
      const { includeDeleted, page = 1, limit = 20, patientName, diagnosis } = req.query;
      const query = includeDeleted === 'true' ? {} : { deletedAt: null };

      if (patientName) query.patientName = { $regex: patientName, $options: 'i' };
      if (diagnosis) query.diagnosis = { $regex: diagnosis, $options: 'i' };

      const records = await Record.find(query)
        .populate('createdBy', 'username email')
        .skip((page - 1) * limit)
        .limit(Number(limit));

      const transformedRecords = records.map(record => {
        const recordObj = record.toObject();
        if (recordObj.files?.length > 0) {
          recordObj.files = recordObj.files.map(file => ({
            ...file,
            url: `${IPFS_GATEWAY}${file.cid}`,
          }));
        }
        return recordObj;
      });

      return ApiResponse.success(
        res,
        { records: transformedRecords },
        'Records retrieved successfully'
      );
    } catch (error) {
      console.error('Error retrieving records:', error);
      return ApiResponse.error(res, error.message, 500);
    }
  },

  // Get record by ID
  getRecordById: async (req, res) => {
    try {
      const { id } = req.params;
      const record = await Record.findById(id).populate('createdBy', 'username email');
      if (!record) {
        return ApiResponse.error(res, 'Record not found', 404);
      }

      const recordObj = record.toObject();
      if (recordObj.files?.length > 0) {
        recordObj.files = recordObj.files.map(file => ({
          ...file,
          url: `${IPFS_GATEWAY}${file.cid}`,
        }));
      }

      return ApiResponse.success(res, { record: recordObj }, 'Record retrieved successfully');
    } catch (error) {
      console.error('Error retrieving record:', error);
      return ApiResponse.error(res, error.message, 500);
    }
  },

  // Create a new record
  createRecord: async (req, res) => {
    try {
      const { patientName, diagnosis, treatment, txHash } = req.body;
      const record = new Record({
        patientName,
        diagnosis,
        treatment,
        txHash,
        clientUUID:
          req.body.clientUUID || `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        syncTimestamp: req.body.syncTimestamp || new Date(),
        createdBy: req.user._id,
      });
      await record.save();

      // Emit WebSocket event for real-time notifications
      const payload = {
        recordId: record._id,
        patientName: record.patientName,
        diagnosis: record.diagnosis,
        createdBy: record.createdBy,
      };
      notifyUser(req.user._id.toString(), 'record.created', payload);
      notifyResource(record._id.toString(), 'record.created', payload);

      return ApiResponse.success(res, { record }, 'Record created successfully');
    } catch (error) {
      console.error('Error creating record:', error);
      return ApiResponse.error(res, error.message, 500);
    }
  },

  // Update a record
  updateRecord: async (req, res) => {
    try {
      const { id } = req.params;
      const { patientName, diagnosis, treatment } = req.body;

      const record = await Record.findById(id);
      if (!record) {
        return ApiResponse.error(res, 'Record not found', 404);
      }

      if (patientName) record.patientName = patientName;
      if (diagnosis) record.diagnosis = diagnosis;
      if (treatment) record.treatment = treatment;

      await record.save();

      // Emit WebSocket event for real-time notifications
      const payload = {
        recordId: record._id,
        patientName: record.patientName,
        diagnosis: record.diagnosis,
        updatedBy: req.user._id,
      };
      notifyUser(record.createdBy.toString(), 'record.updated', payload);
      notifyResource(record._id.toString(), 'record.updated', payload);

      return ApiResponse.success(res, { record }, 'Record updated successfully');
    } catch (error) {
      console.error('Error updating record:', error);
      return ApiResponse.error(res, error.message, 500);
    }
  },

  // Soft-delete a record
  deleteRecord: async (req, res) => {
    try {
      const { id } = req.params;
      const record = await Record.findOne({ _id: id, deletedAt: null });
      if (!record) {
        return ApiResponse.error(res, 'Record not found or already deleted', 404);
      }

      record.deletedAt = new Date();
      record.deletedBy = req.user?._id || null;

      await record.save();
      return ApiResponse.success(res, null, 'Record soft-deleted successfully');
    } catch (error) {
      console.error('Error deleting record:', error);
      return ApiResponse.error(res, error.message, 500);
    }
  },

  restoreRecord: async (req, res) => {
    try {
      await withTransaction(async session => {
        const record = await Record.findOne({
          _id: req.params.id,
          deletedAt: { $ne: null },
        }).session(session);

        if (!record) {
          throw new Error('Record not found or not deleted');
        }

        record.deletedAt = null;
        record.deletedBy = null;
        await record.save({ session });

        await transactionLog.create(
          [
            {
              action: 'restore',
              resource: 'Record',
              resourceId: record._id,
              performedBy: req.user?._id || 'admin',
              timestamp: new Date(),
              details: 'Record restored by admin.',
            },
          ],
          { session }
        );
      });

      return ApiResponse.success(res, null, 'Record restored successfully');
    } catch (error) {
      const status = error.message.includes('not found') ? 404 : 500;
      return ApiResponse.error(res, error.message, status);
    }
  },

  purgeRecord: async (req, res) => {
    try {
      await withTransaction(async session => {
        const record = await Record.findOne({
          _id: req.params.id,
          deletedAt: { $ne: null },
        }).session(session);

        if (!record) {
          throw new Error('Record not found or not deleted');
        }

        const recordId = record._id;
        await record.deleteOne({ session });

        await transactionLog.create(
          [
            {
              action: 'purge',
              resource: 'Record',
              resourceId: recordId,
              performedBy: req.user?._id || 'admin',
              timestamp: new Date(),
              details: 'Record permanently purged by admin.',
            },
          ],
          { session }
        );
      });

      return ApiResponse.success(res, null, 'Record permanently purged');
    } catch (error) {
      const status = error.message.includes('not found') ? 404 : 500;
      return ApiResponse.error(res, error.message, status);
    }
  },
};

export default recordController;
