import { AsyncLocalStorage } from 'async_hooks';

const storageKey = Symbol.for('uzima.tenantStorage');
if (!global[storageKey]) {
    global[storageKey] = new AsyncLocalStorage();
}
const tenantStorage = global[storageKey];

export const setTenantId = (tenantId, next) => {
    return tenantStorage.run(tenantId, next);
};

export const getTenantId = () => {
    const store = tenantStorage.getStore();
    return store;
};

export default {
    setTenantId,
    getTenantId,
};
