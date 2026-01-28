import AuditLog from '../models/auditLog.model.js';

export const logAction = action => {
  return async (req, res, next) => {
    res.on('finish', async () => {
      if ([200, 201, 204].includes(res.statusCode)) {
        try {
          await AuditLog.create({
            userId: req.user?._id, // from auth middleware
            action,
            resourceId: req.params.id || req.body._id,
          });
        } catch (err) {
          console.error('Audit log error:', err.message);
        }
      }
    });
    next();
  };
};
