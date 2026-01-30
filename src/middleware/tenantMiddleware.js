import { setTenantId } from '../utils/tenantContext.js';

const tenantMiddleware = (req, res, next) => {
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'];

    if (tenantId) {
        setTenantId(tenantId, next);
    } else {
        next();
    }
};

export default tenantMiddleware;
