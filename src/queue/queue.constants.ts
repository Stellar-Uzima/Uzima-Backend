/**
 * Queue name constants for the application
 * These constants ensure type safety and prevent magic strings throughout the codebase
 */

// Queue Names
export const REWARD_QUEUE = 'reward-queue' as const;
export const NOTIFICATION_QUEUE = 'notification-queue' as const;
export const TASK_VERIFICATION_QUEUE = 'task-verification-queue' as const;
export const USER_ACTIVITY_QUEUE = 'user-activity-queue' as const;
export const DATA_PROCESSING_QUEUE = 'data-processing-queue' as const;

// Queue Job Types for Reward Queue
export const REWARD_DISTRIBUTION_JOB = 'reward-distribution' as const;
export const REWARD_CALCULATION_JOB = 'reward-calculation' as const;
export const REWARD_CLAIM_JOB = 'reward-claim' as const;

// Queue Job Types for Notification Queue
export const EMAIL_NOTIFICATION_JOB = 'email-notification' as const;
export const PUSH_NOTIFICATION_JOB = 'push-notification' as const;
export const SMS_NOTIFICATION_JOB = 'sms-notification' as const;

// Queue Job Types for Task Verification Queue
export const TASK_COMPLETION_VERIFICATION_JOB = 'task-completion-verification' as const;
export const TASK_QUALITY_CHECK_JOB = 'task-quality-check' as const;
export const TASK_APPROVAL_JOB = 'task-approval' as const;

// Type definitions for better type safety
export type QueueName =
  | typeof REWARD_QUEUE
  | typeof NOTIFICATION_QUEUE
  | typeof TASK_VERIFICATION_QUEUE
  | typeof USER_ACTIVITY_QUEUE
  | typeof DATA_PROCESSING_QUEUE;

export type RewardJobType =
  | typeof REWARD_DISTRIBUTION_JOB
  | typeof REWARD_CALCULATION_JOB
  | typeof REWARD_CLAIM_JOB;

export type NotificationJobType =
  | typeof EMAIL_NOTIFICATION_JOB
  | typeof PUSH_NOTIFICATION_JOB
  | typeof SMS_NOTIFICATION_JOB;

export type TaskVerificationJobType =
  | typeof TASK_COMPLETION_VERIFICATION_JOB
  | typeof TASK_QUALITY_CHECK_JOB
  | typeof TASK_APPROVAL_JOB;

// All job types combined
export type JobType =
  | RewardJobType
  | NotificationJobType
  | TaskVerificationJobType;

// Queue configuration interface
export interface QueueConfig {
  name: QueueName;
  concurrency?: number;
  limiter?: {
    max: number;
    duration: number;
  };
}
