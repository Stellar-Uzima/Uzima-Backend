// Stub email queue for prescription verification system

const emailQueue = {
  add: (jobName, data) => {
    console.log(`Email job '${jobName}' queued (stub):`, data);
    return Promise.resolve({ id: 'stub-job-id' });
  }
};
export const enqueueEmail = (data) => {
  console.log('Email enqueued (stub):', data);
  return emailQueue.add('send-email', data);
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