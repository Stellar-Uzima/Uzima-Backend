import User from '../models/User.js';
import ApiResponse from '../utils/apiResponse.js';
import transactionLog from '../models/transactionLog.js';
import { withTransaction } from '../utils/withTransaction.js';
import cache from '../services/cacheService.js';
import { userByIdKey, cacheNamespaces, userListKey } from '../utils/cacheKeys.js';

const userController = {
  // Get all users (with optional soft-deleted)
  getAllUsers: async (req, res) => {
    const { includeDeleted, page = 1, limit = 20 } = req.query;
    try {
      const query = includeDeleted === 'true' ? {} : { deletedAt: null };
      const users = await User.find(query)
        .skip((page - 1) * limit)
        .limit(Number(limit));
      if (!users || users.length === 0) {
        return ApiResponse.error(res, 'No users found', 404);
      }
      const resUsers = users.map(user => ({
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
      }));
      return ApiResponse.success(res, resUsers, 'Users retrieved successfully');
    } catch (error) {
      return ApiResponse.error(res, error.message, 500);
    }
  },

  // Get single user
  getUserById: async (req, res) => {
    try {
      const user = await User.findOne({ _id: req.params.id, deletedAt: null });
      if (!user) {
        return ApiResponse.error(res, 'User not found', 404);
      }
      const { _id, username, email, role } = user;
      const resUser = {
        id: _id,
        username,
        email,
        role,
      };
      return ApiResponse.success(res, resUser, 'User retrieved successfully');
    } catch (error) {
      return ApiResponse.error(res, error.message, 500);
    }
  },

  // Restore soft-deleted user
  restoreUser: async (req, res) => {
    try {
      await withTransaction(async session => {
        const user = await User.findOne({ _id: req.params.id, deletedAt: { $ne: null } }).session(
          session
        );
        if (!user) {
          throw new Error('User not found or not deleted');
        }
        user.deletedAt = null;
        user.deletedBy = null;
        await user.save({ session });
        await transactionLog.create(
          [
            {
              action: 'restore',
              resource: 'User',
              resourceId: user._id,
              performedBy: req.user?._id || 'admin',
              timestamp: new Date(),
              details: 'User restored by admin.',
            },
          ],
          { session }
        );
      });
      // Invalidate user cache entries
      try {
        await cache.del(userByIdKey(req.params.id));
        await cache.mdel(`${cacheNamespaces.users}:list`);
      } catch {}
      return ApiResponse.success(res, null, 'User restored successfully');
    } catch (error) {
      const status = error.message.includes('not found') ? 404 : 500;
      return ApiResponse.error(res, error.message, status);
    }
  },

  // Permanently purge user
  purgeUser: async (req, res) => {
    try {
      await withTransaction(async session => {
        const user = await User.findOne({ _id: req.params.id, deletedAt: { $ne: null } }).session(
          session
        );
        if (!user) {
          throw new Error('User not found or not deleted');
        }
        const userId = user._id;
        await user.deleteOne({ session });
        await transactionLog.create(
          [
            {
              action: 'purge',
              resource: 'User',
              resourceId: userId,
              performedBy: req.user?._id || 'admin',
              timestamp: new Date(),
              details: 'User permanently purged by admin.',
            },
          ],
          { session }
        );
      });
      try {
        await cache.del(userByIdKey(req.params.id));
        await cache.mdel(`${cacheNamespaces.users}:list`);
      } catch {}
      return ApiResponse.success(res, null, 'User permanently purged');
    } catch (error) {
      const status = error.message.includes('not found') ? 404 : 500;
      return ApiResponse.error(res, error.message, status);
    }
  },
};

export default userController;
