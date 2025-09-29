// Cache key builders. Keep naming consistent: domain:resource:params

export const cacheNamespaces = {
  users: 'users',
  records: 'records',
  credits: 'credits',
  misc: 'misc'
};

// Users
export const userListKey = ({ includeDeleted = false, page = 1, limit = 20 } = {}) =>
  `${cacheNamespaces.users}:list:deleted=${includeDeleted}:page=${page}:limit=${limit}`;

export const userByIdKey = (userId) => `${cacheNamespaces.users}:id:${userId}`;

// Records
export const recordListKey = ({ page = 1, limit = 20 } = {}) =>
  `${cacheNamespaces.records}:list:page=${page}:limit=${limit}`;

export const recordByIdKey = (recordId) => `${cacheNamespaces.records}:id:${recordId}`;

// Credit score example (placeholder)
export const creditScoreKey = (userId) => `${cacheNamespaces.credits}:score:user:${userId}`;

// Utility to compose arbitrary keys
export const composeKey = (namespace, ...parts) => [namespace, ...parts].join(':');


