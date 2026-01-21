// Stub email queue for prescription verification system
export function enqueueEmail(data) {
  // Stub implementation
  console.log('Email queued (stub):', data);
  return Promise.resolve();
}

export function getQueueStats() {
  // Stub implementation
  return {
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
  };
}

export default {
  add: () => Promise.resolve(),
  process: () => {},
  getStats: getQueueStats,
};
