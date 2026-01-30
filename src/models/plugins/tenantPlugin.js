import mongoose from 'mongoose';
import { getTenantId } from '../../utils/tenantContext.js';

const tenantPlugin = (schema) => {
    schema.add({
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Tenant',
            required: true,
            index: true,
        },
    });

    const injectTenantFilter = function (next) {
        const tenantId = getTenantId();
        if (tenantId) {
            this.where({ tenantId });
        }
        next();
    };

    schema.pre('find', injectTenantFilter);
    schema.pre('findOne', injectTenantFilter);
    schema.pre('findOneAndUpdate', injectTenantFilter);
    schema.pre('countDocuments', injectTenantFilter);
    schema.pre('deleteOne', injectTenantFilter);
    schema.pre('deleteMany', injectTenantFilter);
    schema.pre('updateOne', injectTenantFilter);
    schema.pre('updateMany', injectTenantFilter);

    schema.pre('validate', function (next) {
        const tenantId = getTenantId();
        if (tenantId && !this.tenantId) {
            this.tenantId = tenantId;
        }
        next();
    });
};

export default tenantPlugin;
