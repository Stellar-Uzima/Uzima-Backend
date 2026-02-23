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

// Type definitions for better type safety
export type QueueName =
  | typeof REWARD_QUEUE
  | typeof NOTIFICATION_QUEUE
  | typeof TASK_VERIFICATION_QUEUE
  | typeof USER_ACTIVITY_QUEUE
  | typeof DATA_PROCESSING_QUEUE;

// Queue configuration interface
export interface QueueConfig {
  name: QueueName;
  concurrency?: number;
  limiter?: {
    max: number;
    duration: number;
  };
}