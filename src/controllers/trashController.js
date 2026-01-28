import User from '../models/User.js';
import Record from '../models/Record.js';
import Prescription from '../models/Prescription.js';
import InventoryItem from '../models/InventoryItem.js';
import Payment from '../models/Payment.js';
import Permission from '../models/Permission.js';
import Article from '../models/Article.js';
import FileMetadata from '../models/FileMetadata.js';
import ApiResponse from '../utils/apiResponse.js';

/**
 * Model registry for trash operations
 * Maps resource type names to their Mongoose models
 */
const TRASH_MODELS = {
    user: { model: User, displayName: 'User' },
    record: { model: Record, displayName: 'Record' },
    prescription: { model: Prescription, displayName: 'Prescription' },
    inventory: { model: InventoryItem, displayName: 'InventoryItem' },
    payment: { model: Payment, displayName: 'Payment' },
    permission: { model: Permission, displayName: 'Permission' },
    article: { model: Article, displayName: 'Article' },
    file: { model: FileMetadata, displayName: 'FileMetadata' },
};

const trashController = {
    /**
     * Get all soft-deleted items across all resource types
     * GET /api/admin/trash
     * Query params:
     *   - resourceType: filter by type (user, record, prescription, etc.)
     *   - page: page number (default: 1)
     *   - limit: items per page (default: 20)
     *   - deletedAfter: ISO date - only items deleted after this date
     *   - deletedBefore: ISO date - only items deleted before this date
     *   - deletedBy: userId - filter by who deleted the item
     */
    getTrashItems: async (req, res) => {
        try {
            const {
                resourceType,
                page = 1,
                limit = 20,
                deletedAfter,
                deletedBefore,
                deletedBy,
            } = req.query;

            const pageNum = parseInt(page, 10);
            const limitNum = parseInt(limit, 10);

            // Build date filter
            const dateFilter = {};
            if (deletedAfter) {
                dateFilter.$gte = new Date(deletedAfter);
            }
            if (deletedBefore) {
                dateFilter.$lte = new Date(deletedBefore);
            }

            // Base query for deleted items
            const buildQuery = () => {
                const query = { deletedAt: { $ne: null } };
                if (Object.keys(dateFilter).length > 0) {
                    query.deletedAt = { ...query.deletedAt, ...dateFilter };
                }
                if (deletedBy) {
                    query.deletedBy = deletedBy;
                }
                return query;
            };

            let results = [];

            // If specific resource type requested
            if (resourceType && TRASH_MODELS[resourceType]) {
                const { model, displayName } = TRASH_MODELS[resourceType];
                const query = buildQuery();

                const items = await model
                    .find(query)
                    .setOptions({ includeDeleted: true })
                    .sort({ deletedAt: -1 })
                    .skip((pageNum - 1) * limitNum)
                    .limit(limitNum)
                    .populate('deletedBy', 'username email')
                    .lean();

                const total = await model
                    .countDocuments(query)
                    .setOptions({ includeDeleted: true });

                results = items.map(item => ({
                    ...item,
                    _resourceType: resourceType,
                    _displayName: displayName,
                }));

                return ApiResponse.success(res, {
                    items: results,
                    pagination: {
                        page: pageNum,
                        limit: limitNum,
                        total,
                        pages: Math.ceil(total / limitNum),
                    },
                    resourceType,
                }, 'Trash items retrieved successfully');
            }

            // Get items from all resource types
            const allResults = [];
            const counts = {};

            for (const [type, { model, displayName }] of Object.entries(TRASH_MODELS)) {
                try {
                    const query = buildQuery();

                    const items = await model
                        .find(query)
                        .setOptions({ includeDeleted: true })
                        .sort({ deletedAt: -1 })
                        .limit(50) // Limit per type when fetching all
                        .populate('deletedBy', 'username email')
                        .lean();

                    const count = await model
                        .countDocuments(query)
                        .setOptions({ includeDeleted: true });

                    counts[type] = count;

                    items.forEach(item => {
                        allResults.push({
                            ...item,
                            _resourceType: type,
                            _displayName: displayName,
                        });
                    });
                } catch (err) {
                    // Model might not support soft delete yet, skip it
                    console.warn(`Trash: Could not query ${displayName}:`, err.message);
                }
            }

            // Sort all results by deletedAt descending
            allResults.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));

            // Paginate the combined results
            const paginatedResults = allResults.slice(
                (pageNum - 1) * limitNum,
                pageNum * limitNum
            );

            const totalItems = Object.values(counts).reduce((sum, c) => sum + c, 0);

            return ApiResponse.success(res, {
                items: paginatedResults,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total: totalItems,
                    pages: Math.ceil(totalItems / limitNum),
                },
                countsByType: counts,
            }, 'Trash items retrieved successfully');

        } catch (error) {
            console.error('Error retrieving trash items:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    },

    /**
     * Get trash statistics
     * GET /api/admin/trash/stats
     */
    getTrashStats: async (req, res) => {
        try {
            const stats = {
                totalItems: 0,
                byResourceType: {},
                oldestItem: null,
                newestItem: null,
                itemsDueForPurge: 0, // Items older than 30 days
            };

            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

            for (const [type, { model, displayName }] of Object.entries(TRASH_MODELS)) {
                try {
                    const count = await model
                        .countDocuments({ deletedAt: { $ne: null } })
                        .setOptions({ includeDeleted: true });

                    const dueForPurge = await model
                        .countDocuments({ deletedAt: { $lte: thirtyDaysAgo } })
                        .setOptions({ includeDeleted: true });

                    stats.byResourceType[type] = {
                        count,
                        displayName,
                        dueForPurge,
                    };
                    stats.totalItems += count;
                    stats.itemsDueForPurge += dueForPurge;

                    // Find oldest and newest deleted items
                    if (count > 0) {
                        const oldest = await model
                            .findOne({ deletedAt: { $ne: null } })
                            .setOptions({ includeDeleted: true })
                            .sort({ deletedAt: 1 })
                            .select('deletedAt')
                            .lean();

                        const newest = await model
                            .findOne({ deletedAt: { $ne: null } })
                            .setOptions({ includeDeleted: true })
                            .sort({ deletedAt: -1 })
                            .select('deletedAt')
                            .lean();

                        if (!stats.oldestItem || new Date(oldest.deletedAt) < new Date(stats.oldestItem.deletedAt)) {
                            stats.oldestItem = { ...oldest, resourceType: type };
                        }
                        if (!stats.newestItem || new Date(newest.deletedAt) > new Date(stats.newestItem.deletedAt)) {
                            stats.newestItem = { ...newest, resourceType: type };
                        }
                    }
                } catch (err) {
                    console.warn(`Trash stats: Could not query ${displayName}:`, err.message);
                }
            }

            return ApiResponse.success(res, stats, 'Trash statistics retrieved successfully');

        } catch (error) {
            console.error('Error retrieving trash stats:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    },

    /**
     * Restore a soft-deleted item
     * POST /api/admin/trash/restore/:resourceType/:id
     */
    restoreItem: async (req, res) => {
        try {
            const { resourceType, id } = req.params;

            if (!TRASH_MODELS[resourceType]) {
                return ApiResponse.error(res, `Unknown resource type: ${resourceType}`, 400);
            }

            const { model, displayName } = TRASH_MODELS[resourceType];

            const item = await model
                .findOne({ _id: id, deletedAt: { $ne: null } })
                .setOptions({ includeDeleted: true });

            if (!item) {
                return ApiResponse.error(res, `${displayName} not found or not deleted`, 404);
            }

            // Use the restore method from softDeletePlugin if available
            if (typeof item.restore === 'function') {
                await item.restore();
            } else {
                item.deletedAt = null;
                item.deletedBy = null;
                await item.save();
            }

            return ApiResponse.success(res, { id, resourceType }, `${displayName} restored successfully`);

        } catch (error) {
            console.error('Error restoring item:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    },

    /**
     * Permanently delete an item from trash
     * DELETE /api/admin/trash/:resourceType/:id
     */
    purgeItem: async (req, res) => {
        try {
            const { resourceType, id } = req.params;

            if (!TRASH_MODELS[resourceType]) {
                return ApiResponse.error(res, `Unknown resource type: ${resourceType}`, 400);
            }

            const { model, displayName } = TRASH_MODELS[resourceType];

            const item = await model
                .findOne({ _id: id, deletedAt: { $ne: null } })
                .setOptions({ includeDeleted: true });

            if (!item) {
                return ApiResponse.error(res, `${displayName} not found or not in trash`, 404);
            }

            await item.deleteOne();

            return ApiResponse.success(res, { id, resourceType }, `${displayName} permanently deleted`);

        } catch (error) {
            console.error('Error purging item:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    },

    /**
     * Empty all items from trash (purge all)
     * DELETE /api/admin/trash/empty
     * Query params:
     *   - resourceType: optional, only empty specific type
     *   - olderThan: optional, only purge items older than N days
     */
    emptyTrash: async (req, res) => {
        try {
            const { resourceType, olderThan } = req.query;

            const buildQuery = () => {
                const query = { deletedAt: { $ne: null } };
                if (olderThan) {
                    const cutoff = new Date(Date.now() - parseInt(olderThan, 10) * 24 * 60 * 60 * 1000);
                    query.deletedAt = { $lte: cutoff };
                }
                return query;
            };

            const results = {};

            if (resourceType && TRASH_MODELS[resourceType]) {
                const { model, displayName } = TRASH_MODELS[resourceType];
                const query = buildQuery();
                const result = await model.deleteMany(query);
                results[resourceType] = result.deletedCount;
            } else {
                for (const [type, { model }] of Object.entries(TRASH_MODELS)) {
                    try {
                        const query = buildQuery();
                        const result = await model.deleteMany(query);
                        results[type] = result.deletedCount;
                    } catch (err) {
                        results[type] = { error: err.message };
                    }
                }
            }

            const totalDeleted = Object.values(results)
                .filter(v => typeof v === 'number')
                .reduce((sum, n) => sum + n, 0);

            return ApiResponse.success(res, {
                deletedByType: results,
                totalDeleted,
            }, `Trash emptied: ${totalDeleted} items permanently deleted`);

        } catch (error) {
            console.error('Error emptying trash:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    },

    /**
     * Get available resource types for trash
     * GET /api/admin/trash/types
     */
    getResourceTypes: async (req, res) => {
        try {
            const types = Object.entries(TRASH_MODELS).map(([key, { displayName }]) => ({
                key,
                displayName,
            }));

            return ApiResponse.success(res, { types }, 'Resource types retrieved successfully');

        } catch (error) {
            console.error('Error retrieving resource types:', error);
            return ApiResponse.error(res, error.message, 500);
        }
    },
};

export default trashController;
