import DataLoader from 'dataloader';
import { getAppointments, getAppointmentsForTomorrow } from '../models/appointmentModel.js';
import RecordModel from '../models/Record.js';
import UserModel from '../models/User.js';
import ActivityLogModel from '../models/ActivityLog.js';
import { getVitalsMetrics } from '../controllers/metrics.controller.js';
import { GraphQLError } from 'graphql';

// DataLoader instances for batching queries
const createDataLoaders = () => ({
  userLoader: new DataLoader(async (ids) => {
    const users = await UserModel.find({ _id: { $in: ids }, deletedAt: null });
    const userMap = new Map(users.map(user => [user._id.toString(), user]));
    return ids.map(id => userMap.get(id.toString()) || null);
  }),
  
  recordLoader: new DataLoader(async (ids) => {
    const records = await RecordModel.find({ _id: { $in: ids }, deletedAt: null });
    const recordMap = new Map(records.map(record => [record._id.toString(), record]));
    return ids.map(id => recordMap.get(id.toString()) || null);
  }),
  
  activityLogLoader: new DataLoader(async (ids) => {
    const logs = await ActivityLogModel.find({ _id: { $in: ids } });
    const logMap = new Map(logs.map(log => [log._id.toString(), log]));
    return ids.map(id => logMap.get(id.toString()) || null);
  }),
  
  userRecordsLoader: new DataLoader(async (userIds) => {
    const records = await RecordModel.find({ 
      createdBy: { $in: userIdIds }, 
      deletedAt: null 
    }).sort({ createdAt: -1 });
    
    const recordsByUser = new Map();
    userIds.forEach(userId => recordsByUser.set(userId, []));
    
    records.forEach(record => {
      const userId = record.createdBy.toString();
      recordsByUser.get(userId).push(record);
    });
    
    return userIds.map(userId => recordsByUser.get(userId.toString()));
  }),
  
  userActivityLogsLoader: new DataLoader(async (userIds) => {
    const logs = await ActivityLogModel.find({ 
      userId: { $in: userIdIds } 
    }).sort({ timestamp: -1 });
    
    const logsByUser = new Map();
    userIds.forEach(userId => logsByUser.set(userId, []));
    
    logs.forEach(log => {
      const userId = log.userId.toString();
      logsByUser.get(userId).push(log);
    });
    
    return userIds.map(userId => logsByUser.get(userId.toString()));
  })
});

// Cursor-based pagination helper
const paginate = async (Model, query, { first, after, before, last }, sortField = 'createdAt') => {
  const limit = Math.min(first || last || 20, 100); // Max 100 items per page
  const isForwardPagination = first && !last;
  
  // Parse cursor
  const cursor = after || before;
  let cursorFilter = {};
  
  if (cursor) {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf8');
      const [field, value] = decoded.split(':');
      
      if (isForwardPagination) {
        cursorFilter[field] = { $gt: new Date(value) };
      } else {
        cursorFilter[field] = { $lt: new Date(value) };
      }
    } catch (error) {
      throw new GraphQLError('Invalid cursor provided');
    }
  }
  
  // Build the final query
  const finalQuery = { ...query, ...cursorFilter };
  
  // Get total count
  const totalCount = await Model.countDocuments(query);
  
  // Execute query with sorting
  const sortOrder = isForwardPagination ? -1 : 1;
  const items = await Model
    .find(finalQuery)
    .sort({ [sortField]: sortOrder })
    .limit(limit + 1); // Fetch one extra to determine if there are more pages
  
  // Determine if we have more items
  const hasNextPage = isForwardPagination ? items.length > limit : false;
  const hasPreviousPage = !isForwardPagination ? items.length > limit : false;
  
  // Remove the extra item if present
  const edges = hasNextPage || hasPreviousPage ? items.slice(0, -1) : items;
  
  // Reverse order for backward pagination
  if (!isForwardPagination) {
    edges.reverse();
  }
  
  // Create edges with cursors
  const formattedEdges = edges.map(item => ({
    node: item,
    cursor: Buffer.from(`${sortField}:${item[sortField].toISOString()}`).toString('base64')
  }));
  
  // Determine page info
  const startCursor = formattedEdges.length > 0 ? formattedEdges[0].cursor : null;
  const endCursor = formattedEdges.length > 0 ? formattedEdges[formattedEdges.length - 1].cursor : null;
  
  return {
    edges: formattedEdges,
    pageInfo: {
      hasNextPage,
      hasPreviousPage,
      startCursor,
      endCursor,
      totalCount
    }
  };
};

// Resolvers
export const resolvers = {
  // Custom scalar resolvers
  DateTime: {
    serialize: (value) => (value instanceof Date ? value.toISOString() : value),
    parseValue: (value) => (typeof value === 'string' ? new Date(value) : value),
    parseLiteral: (ast) => (ast.kind === 'StringValue' ? new Date(ast.value) : null)
  },
  
  Date: {
    serialize: (value) => (value instanceof Date ? value.toISOString().split('T')[0] : value),
    parseValue: (value) => (typeof value === 'string' ? new Date(value) : value),
    parseLiteral: (ast) => (ast.kind === 'StringValue' ? new Date(ast.value) : null)
  },
  
  JSON: {
    serialize: (value) => value,
    parseValue: (value) => value,
    parseLiteral: (ast) => {
      switch (ast.kind) {
        case 'StringValue':
        case 'BooleanValue':
        case 'IntValue':
        case 'FloatValue':
          return ast.value;
        case 'ObjectValue':
          const obj = {};
          ast.fields.forEach(field => {
            obj[field.name.value] = field.value.value;
          });
          return obj;
        default:
          return null;
      }
    }
  },

  // Field resolvers for nested relationships
  User: {
    oauthProviders: (parent) => {
      if (!parent.oauthAccounts) return [];
      return Object.entries(parent.oauthAccounts)
        .filter(([_, account]) => account && account.id)
        .map(([provider, account]) => ({
          provider,
          email: account.email,
          name: account.name,
          linkedAt: account.linkedAt
        }));
    },
    
    activityLogs: async (parent, args, { loaders }) => {
      if (!loaders) {
        // Fallback if no loaders available
        return paginate(
          ActivityLogModel,
          { userId: parent._id },
          args,
          'timestamp'
        );
      }
      
      const logs = await loaders.userActivityLogsLoader.load(parent._id.toString());
      // Apply pagination to the loaded logs
      const { first, after, before, last } = args;
      const limit = Math.min(first || last || 20, 100);
      
      // Simple pagination for loaded data
      let startIndex = 0;
      if (after) {
        const index = logs.findIndex(log => log._id.toString() === after);
        if (index !== -1) startIndex = index + 1;
      }
      
      const endIndex = first ? startIndex + limit : logs.length;
      const paginatedLogs = logs.slice(startIndex, endIndex);
      
      return {
        edges: paginatedLogs.map(log => ({
          node: log,
          cursor: Buffer.from(`timestamp:${log.timestamp.toISOString()}`).toString('base64')
        })),
        pageInfo: {
          hasNextPage: endIndex < logs.length,
          hasPreviousPage: startIndex > 0,
          startCursor: paginatedLogs.length > 0 ? 
            Buffer.from(`timestamp:${paginatedLogs[0].timestamp.toISOString()}`).toString('base64') : null,
          endCursor: paginatedLogs.length > 0 ? 
            Buffer.from(`timestamp:${paginatedLogs[paginatedLogs.length - 1].timestamp.toISOString()}`).toString('base64') : null,
          totalCount: logs.length
        }
      };
    },
    
    records: async (parent, args, { loaders }) => {
      if (!loaders) {
        return paginate(
          RecordModel,
          { createdBy: parent._id, deletedAt: null },
          args,
          'createdAt'
        );
      }
      
      const records = await loaders.userRecordsLoader.load(parent._id.toString());
      // Apply pagination similar to activityLogs
      const { first, after, before, last } = args;
      const limit = Math.min(first || last || 20, 100);
      
      let startIndex = 0;
      if (after) {
        const index = records.findIndex(record => record._id.toString() === after);
        if (index !== -1) startIndex = index + 1;
      }
      
      const endIndex = first ? startIndex + limit : records.length;
      const paginatedRecords = records.slice(startIndex, endIndex);
      
      return {
        edges: paginatedRecords.map(record => ({
          node: record,
          cursor: Buffer.from(`createdAt:${record.createdAt.toISOString()}`).toString('base64')
        })),
        pageInfo: {
          hasNextPage: endIndex < records.length,
          hasPreviousPage: startIndex > 0,
          startCursor: paginatedRecords.length > 0 ? 
            Buffer.from(`createdAt:${paginatedRecords[0].createdAt.toISOString()}`).toString('base64') : null,
          endCursor: paginatedRecords.length > 0 ? 
            Buffer.from(`createdAt:${paginatedRecords[paginatedRecords.length - 1].createdAt.toISOString()}`).toString('base64') : null,
          totalCount: records.length
        }
      };
    }
  },
  
  Record: {
    createdBy: async (parent, _, { loaders }) => {
      if (loaders) {
        return await loaders.userLoader.load(parent.createdBy.toString());
      }
      return await UserModel.findById(parent.createdBy);
    }
  },
  
  ActivityLog: {
    user: async (parent, _, { loaders }) => {
      if (loaders) {
        return await loaders.userLoader.load(parent.userId.toString());
      }
      return await UserModel.findById(parent.userId);
    }
  },

  Query: {
    // User queries
    users: async (_, args, { user, loaders }) => {
      // Authorization check
      if (!user || !['admin', 'educator'].includes(user.role)) {
        throw new GraphQLError('Insufficient permissions to view users');
      }
      
      const { role, tenantId, first, after, before, last } = args;
      const query = { deletedAt: null };
      
      if (role) query.role = role;
      if (tenantId) query.tenantId = tenantId;
      
      return await paginate(UserModel, query, { first, after, before, last }, 'createdAt');
    },
    
    user: async (_, { id }, { user, loaders }) => {
      // Authorization check
      if (!user || (user.id !== id && !['admin', 'educator'].includes(user.role))) {
        throw new GraphQLError('Insufficient permissions to view this user');
      }
      
      if (loaders) {
        return await loaders.userLoader.load(id);
      }
      return await UserModel.findOne({ _id: id, deletedAt: null });
    },
    
    me: async (_, __, { user, loaders }) => {
      if (!user) {
        throw new GraphQLError('Not authenticated');
      }
      
      if (loaders) {
        return await loaders.userLoader.load(user.id);
      }
      return await UserModel.findOne({ _id: user.id, deletedAt: null });
    },

    // Record queries
    records: async (_, args, { user, loaders }) => {
      // Authorization check
      if (!user) {
        throw new GraphQLError('Authentication required');
      }
      
      const { 
        patientName, createdBy, tenantId, startDate, endDate,
        first, after, before, last 
      } = args;
      
      const query = { deletedAt: null };
      
      // Filter based on user role
      if (user.role === 'patient') {
        query.createdBy = user.id;
      } else if (createdBy) {
        query.createdBy = createdBy;
      }
      
      if (patientName) {
        query.patientName = { $regex: patientName, $options: 'i' };
      }
      
      if (tenantId) query.tenantId = tenantId;
      
      if (startDate || endDate) {
        query.date = {};
        if (startDate) query.date.$gte = new Date(startDate);
        if (endDate) query.date.$lte = new Date(endDate);
      }
      
      return await paginate(RecordModel, query, { first, after, before, last }, 'createdAt');
    },
    
    record: async (_, { id }, { user, loaders }) => {
      if (!user) {
        throw new GraphQLError('Authentication required');
      }
      
      const query = { _id: id, deletedAt: null };
      
      // Patients can only view their own records
      if (user.role === 'patient') {
        query.createdBy = user.id;
      }
      
      if (loaders) {
        const record = await loaders.recordLoader.load(id);
        if (!record || record.deletedAt) return null;
        if (user.role === 'patient' && record.createdBy.toString() !== user.id) {
          throw new GraphQLError('Access denied');
        }
        return record;
      }
      
      return await RecordModel.findOne(query);
    },

    // Activity log queries
    activityLogs: async (_, args, { user, loaders }) => {
      if (!user) {
        throw new GraphQLError('Authentication required');
      }
      
      const { filter, first, after, before, last } = args;
      const query = {};
      
      // Apply filters
      if (filter) {
        if (filter.userId) {
          // Non-admin users can only view their own logs
          if (user.role !== 'admin' && filter.userId !== user.id) {
            throw new GraphQLError('Access denied');
          }
          query.userId = filter.userId;
        } else if (user.role !== 'admin') {
          // Default to user's own logs for non-admin users
          query.userId = user.id;
        }
        
        if (filter.action) query.action = filter.action;
        if (filter.result) query.result = filter.result;
        if (filter.resourceType) query.resourceType = filter.resourceType;
        if (filter.resourceId) query.resourceId = filter.resourceId;
        if (filter.ipAddress) query.ipAddress = filter.ipAddress;
        if (filter.sessionId) query.sessionId = filter.sessionId;
        
        if (filter.startDate || filter.endDate) {
          query.timestamp = {};
          if (filter.startDate) query.timestamp.$gte = new Date(filter.startDate);
          if (filter.endDate) query.timestamp.$lte = new Date(filter.endDate);
        }
      } else if (user.role !== 'admin') {
        // Default to user's own logs
        query.userId = user.id;
      }
      
      return await paginate(ActivityLogModel, query, { first, after, before, last }, 'timestamp');
    },
    
    activityLog: async (_, { id }, { user, loaders }) => {
      if (!user) {
        throw new GraphQLError('Authentication required');
      }
      
      const query = { _id: id };
      
      // Non-admin users can only view their own logs
      if (user.role !== 'admin') {
        query.userId = user.id;
      }
      
      if (loaders) {
        const log = await loaders.activityLogLoader.load(id);
        if (!log) return null;
        if (user.role !== 'admin' && log.userId.toString() !== user.id) {
          throw new GraphQLError('Access denied');
        }
        return log;
      }
      
      return await ActivityLogModel.findOne(query);
    },

    // Analytics queries
    userActivityStats: async (_, { userId, startDate, endDate }, { user }) => {
      if (!user) {
        throw new GraphQLError('Authentication required');
      }
      
      // Non-admin users can only view their own stats
      if (user.role !== 'admin' && userId && userId !== user.id) {
        throw new GraphQLError('Access denied');
      }
      
      const filters = {};
      if (userId) filters.userId = userId;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
      
      return await ActivityLogModel.getActivityStats(filters);
    },
    
    registrationTrends: async (_, { startDate, endDate }, { user }) => {
      if (!user || !['admin', 'educator'].includes(user.role)) {
        throw new GraphQLError('Insufficient permissions');
      }
      
      return await UserModel.getRegistrationTrends(
        new Date(startDate),
        new Date(endDate)
      );
    },
    
    roleDistribution: async (_, __, { user }) => {
      if (!user || !['admin', 'educator'].includes(user.role)) {
        throw new GraphQLError('Insufficient permissions');
      }
      
      const distribution = await UserModel.getRoleDistribution();
      return distribution.map(item => ({
        role: item._id,
        count: item.count
      }));
    },

    // Legacy queries for backward compatibility
    appointments: async (_, __, { user }) => {
      if (!user || !['doctor', 'admin'].includes(user.role)) {
        throw new GraphQLError('Insufficient permissions');
      }
      return getAppointmentsForTomorrow();
    },
    
    vitalsMetrics: async (_, args, ctx) => {
      const req = { query: {} };
      if (args.patientId) req.query.patientId = args.patientId;
      if (args.bucket) req.query.bucket = args.bucket;
      if (args.range?.from) req.query.from = args.range.from;
      if (args.range?.to) req.query.to = args.range.to;

      // Reuse REST controller to ensure consistent aggregation and caching
      return await new Promise((resolve, reject) => {
        const res = {
          json: payload => resolve(payload),
          status: () => ({ json: e => reject(e) }),
        };
        getVitalsMetrics(req, res);
      });
    },
  },

  Mutation: {
    // User mutations
    createUser: async (_, { input }, { user }) => {
      if (!user || !['admin', 'educator'].includes(user.role)) {
        throw new GraphQLError('Insufficient permissions to create users');
      }
      
      try {
        const newUser = new UserModel({
          ...input,
          tenantId: user.tenantId // Use current user's tenant
        });
        
        await newUser.save();
        
        return newUser;
      } catch (error) {
        throw new GraphQLError(`Failed to create user: ${error.message}`);
      }
    },
    
    updateUser: async (_, { id, input }, { user, loaders }) => {
      if (!user) {
        throw new GraphQLError('Authentication required');
      }
      
      // Users can update their own profile, admins can update any user
      if (user.id !== id && user.role !== 'admin') {
        throw new GraphQLError('Insufficient permissions');
      }
      
      try {
        const updatedUser = await UserModel.findOneAndUpdate(
          { _id: id, deletedAt: null },
          input,
          { new: true, runValidators: true }
        );
        
        if (!updatedUser) {
          throw new GraphQLError('User not found');
        }
        
        // Clear cache if using DataLoader
        if (loaders) {
          loaders.userLoader.clear(id);
        }
        
        return updatedUser;
      } catch (error) {
        throw new GraphQLError(`Failed to update user: ${error.message}`);
      }
    },
    
    deleteUser: async (_, { id }, { user, loaders }) => {
      if (!user || user.role !== 'admin') {
        throw new GraphQLError('Insufficient permissions to delete users');
      }
      
      try {
        const deletedUser = await UserModel.findOneAndUpdate(
          { _id: id, deletedAt: null },
          { 
            deletedAt: new Date(),
            deletedBy: user.id
          },
          { new: true }
        );
        
        if (!deletedUser) {
          throw new GraphQLError('User not found');
        }
        
        // Clear cache if using DataLoader
        if (loaders) {
          loaders.userLoader.clear(id);
        }
        
        return true;
      } catch (error) {
        throw new GraphQLError(`Failed to delete user: ${error.message}`);
      }
    },

    // Record mutations
    createRecord: async (_, { input }, { user, loaders }) => {
      if (!user) {
        throw new GraphQLError('Authentication required');
      }
      
      try {
        const newRecord = new RecordModel({
          ...input,
          tenantId: user.tenantId,
          createdBy: user.id
        });
        
        await newRecord.save();
        
        // Clear cache if using DataLoader
        if (loaders) {
          loaders.userRecordsLoader.clear(user.id);
        }
        
        return newRecord;
      } catch (error) {
        throw new GraphQLError(`Failed to create record: ${error.message}`);
      }
    },
    
    updateRecord: async (_, { id, input }, { user, loaders }) => {
      if (!user) {
        throw new GraphQLError('Authentication required');
      }
      
      try {
        const query = { _id: id, deletedAt: null };
        
        // Patients can only update their own records
        if (user.role === 'patient') {
          query.createdBy = user.id;
        }
        
        const updatedRecord = await RecordModel.findOneAndUpdate(
          query,
          input,
          { new: true, runValidators: true }
        );
        
        if (!updatedRecord) {
          throw new GraphQLError('Record not found or access denied');
        }
        
        // Clear cache if using DataLoader
        if (loaders) {
          loaders.recordLoader.clear(id);
          loaders.userRecordsLoader.clear(updatedRecord.createdBy.toString());
        }
        
        return updatedRecord;
      } catch (error) {
        throw new GraphQLError(`Failed to update record: ${error.message}`);
      }
    },
    
    deleteRecord: async (_, { id }, { user, loaders }) => {
      if (!user) {
        throw new GraphQLError('Authentication required');
      }
      
      try {
        const query = { _id: id, deletedAt: null };
        
        // Patients can only delete their own records
        if (user.role === 'patient') {
          query.createdBy = user.id;
        }
        
        const deletedRecord = await RecordModel.findOneAndUpdate(
          query,
          { 
            deletedAt: new Date(),
            deletedBy: user.id
          },
          { new: true }
        );
        
        if (!deletedRecord) {
          throw new GraphQLError('Record not found or access denied');
        }
        
        // Clear cache if using DataLoader
        if (loaders) {
          loaders.recordLoader.clear(id);
          loaders.userRecordsLoader.clear(deletedRecord.createdBy.toString());
        }
        
        return true;
      } catch (error) {
        throw new GraphQLError(`Failed to delete record: ${error.message}`);
      }
    },

    // Activity log mutations
    logActivity: async (_, { action, metadata }, { user }) => {
      if (!user) {
        throw new GraphQLError('Authentication required');
      }
      
      try {
        const log = await ActivityLogModel.logActivity({
          userId: user.id,
          action,
          metadata
        });
        
        return log;
      } catch (error) {
        throw new GraphQLError(`Failed to log activity: ${error.message}`);
      }
    },

    // Bulk operations
    bulkCreateRecords: async (_, { records }, { user, loaders }) => {
      if (!user) {
        throw new GraphQLError('Authentication required');
      }
      
      try {
        const recordsToCreate = records.map(record => ({
          ...record,
          tenantId: user.tenantId,
          createdBy: user.id
        }));
        
        const createdRecords = await RecordModel.insertMany(recordsToCreate);
        
        // Clear cache if using DataLoader
        if (loaders) {
          loaders.userRecordsLoader.clear(user.id);
        }
        
        return createdRecords;
      } catch (error) {
        throw new GraphQLError(`Failed to bulk create records: ${error.message}`);
      }
    },
    
    bulkDeleteRecords: async (_, { recordIds }, { user, loaders }) => {
      if (!user) {
        throw new GraphQLError('Authentication required');
      }
      
      try {
        const query = { 
          _id: { $in: recordIds }, 
          deletedAt: null 
        };
        
        // Patients can only delete their own records
        if (user.role === 'patient') {
          query.createdBy = user.id;
        }
        
        const result = await RecordModel.updateMany(
          query,
          { 
            deletedAt: new Date(),
            deletedBy: user.id
          }
        );
        
        // Clear cache if using DataLoader
        if (loaders) {
          recordIds.forEach(id => loaders.recordLoader.clear(id));
          loaders.userRecordsLoader.clear(user.id);
        }
        
        return result.modifiedCount > 0;
      } catch (error) {
        throw new GraphQLError(`Failed to bulk delete records: ${error.message}`);
      }
    }
  }
};

// Context creation function
export const createContext = async ({ req, user }) => {
  const loaders = createDataLoaders();
  
  return {
    user,
    loaders,
    ipAddress: req?.ip || req?.connection?.remoteAddress,
    userAgent: req?.get?.('User-Agent')
  };
};
