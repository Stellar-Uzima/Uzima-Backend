// Stub email queue - placeholder for missing functionality
export const emailQueue = {
  add: (data) => {
    console.log('Email queued (stub):', data);
    return Promise.resolve({ id: 'stub-job-id' });
  }
};

export const enqueueEmail = (data) => {
  console.log('Email enqueued (stub):', data);
  return Promise.resolve({ id: 'stub-job-id' });
};

export const getQueueStats = () => {
  console.log('Getting queue stats (stub)');
  return Promise.resolve({
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    delayed: 0
  });
};

export default emailQueue;