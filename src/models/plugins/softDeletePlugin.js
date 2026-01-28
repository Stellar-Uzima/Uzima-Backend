import mongoose from 'mongoose';

/**
 * Mongoose plugin that adds soft delete functionality to any schema.
 * 
 * Features:
 * - Adds deletedAt and deletedBy fields
 * - Filters out soft-deleted documents from normal queries by default
 * - Provides instance methods: softDelete(), restore()
 * - Provides static methods: findDeleted(), findWithDeleted(), restoreById()
 * 
 * Usage:
 *   import softDeletePlugin from './plugins/softDeletePlugin.js';
 *   mySchema.plugin(softDeletePlugin);
 */
const softDeletePlugin = (schema, options = {}) => {
  // Add soft delete fields
  schema.add({
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  });

  // ========================================
  // Query Middleware - Filter deleted by default
  // ========================================

  const filterDeleted = function (next) {
    // Check if we should include deleted documents
    const query = this.getQuery();

    // Skip filtering if:
    // 1. Query explicitly asks for deleted documents (deletedAt: { $ne: null })
    // 2. Query has includeDeleted option set
    // 3. Query already has a deletedAt condition
    if (
      this.getOptions().includeDeleted ||
      query.deletedAt !== undefined
    ) {
      return next();
    }

    // By default, only return non-deleted documents
    this.where({ deletedAt: null });
    next();
  };

  // Apply to all find operations
  schema.pre('find', filterDeleted);
  schema.pre('findOne', filterDeleted);
  schema.pre('findOneAndUpdate', filterDeleted);
  schema.pre('countDocuments', filterDeleted);

  // ========================================
  // Instance Methods
  // ========================================

  /**
   * Soft delete this document
   * @param {ObjectId} deletedById - ID of the user performing the delete
   * @param {Object} options - Mongoose save options (e.g., { session })
   * @returns {Promise<Document>}
   */
  schema.methods.softDelete = async function (deletedById = null, options = {}) {
    this.deletedAt = new Date();
    this.deletedBy = deletedById;
    return this.save(options);
  };

  /**
   * Restore this soft-deleted document
   * @param {Object} options - Mongoose save options (e.g., { session })
   * @returns {Promise<Document>}
   */
  schema.methods.restore = async function (options = {}) {
    this.deletedAt = null;
    this.deletedBy = null;
    return this.save(options);
  };

  /**
   * Check if this document is soft-deleted
   * @returns {boolean}
   */
  schema.methods.isDeleted = function () {
    return this.deletedAt !== null;
  };

  // ========================================
  // Static Methods
  // ========================================

  /**
   * Find only soft-deleted documents
   * @param {Object} conditions - Query conditions
   * @returns {Query}
   */
  schema.statics.findDeleted = function (conditions = {}) {
    return this.find({
      ...conditions,
      deletedAt: { $ne: null },
    }).setOptions({ includeDeleted: true });
  };

  /**
   * Find all documents including soft-deleted
   * @param {Object} conditions - Query conditions
   * @returns {Query}
   */
  schema.statics.findWithDeleted = function (conditions = {}) {
    return this.find(conditions).setOptions({ includeDeleted: true });
  };

  /**
   * Find one document including soft-deleted
   * @param {Object} conditions - Query conditions
   * @returns {Query}
   */
  schema.statics.findOneWithDeleted = function (conditions = {}) {
    return this.findOne(conditions).setOptions({ includeDeleted: true });
  };

  /**
   * Find one soft-deleted document
   * @param {Object} conditions - Query conditions
   * @returns {Query}
   */
  schema.statics.findOneDeleted = function (conditions = {}) {
    return this.findOne({
      ...conditions,
      deletedAt: { $ne: null },
    }).setOptions({ includeDeleted: true });
  };

  /**
   * Restore a soft-deleted document by ID
   * @param {ObjectId} id - Document ID
   * @param {Object} options - Mongoose options (e.g., { session })
   * @returns {Promise<Document|null>}
   */
  schema.statics.restoreById = async function (id, options = {}) {
    const doc = await this.findOne({ _id: id, deletedAt: { $ne: null } })
      .setOptions({ includeDeleted: true })
      .session(options.session || null);

    if (!doc) {
      return null;
    }

    return doc.restore(options);
  };

  /**
   * Soft delete a document by ID
   * @param {ObjectId} id - Document ID
   * @param {ObjectId} deletedById - ID of user performing delete
   * @param {Object} options - Mongoose options (e.g., { session })
   * @returns {Promise<Document|null>}
   */
  schema.statics.softDeleteById = async function (id, deletedById = null, options = {}) {
    const doc = await this.findOne({ _id: id, deletedAt: null })
      .session(options.session || null);

    if (!doc) {
      return null;
    }

    return doc.softDelete(deletedById, options);
  };

  /**
   * Count only non-deleted documents
   * @param {Object} conditions - Query conditions
   * @returns {Promise<number>}
   */
  schema.statics.countNonDeleted = function (conditions = {}) {
    return this.countDocuments({
      ...conditions,
      deletedAt: null,
    });
  };

  /**
   * Count only deleted documents
   * @param {Object} conditions - Query conditions
   * @returns {Promise<number>}
   */
  schema.statics.countDeleted = function (conditions = {}) {
    return this.countDocuments({
      ...conditions,
      deletedAt: { $ne: null },
    }).setOptions({ includeDeleted: true });
  };

  /**
   * Permanently delete documents older than specified days
   * @param {number} retentionDays - Number of days after which to purge
   * @returns {Promise<{deletedCount: number}>}
   */
  schema.statics.purgeOlderThan = async function (retentionDays = 30) {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    return this.deleteMany({
      deletedAt: { $lte: cutoff },
    });
  };
};

export default softDeletePlugin;
