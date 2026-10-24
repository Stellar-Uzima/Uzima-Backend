export type DigestFrequency = 'daily' | 'weekly';

export const DIGEST = {
  MAX_ATTEMPTS: 3,
  STALE_PENDING_MINUTES: 15,
  MAX_ITEMS: 500,
  // REPLACE the values below with the repo's real names (trusted constants, never user input).
  prefsTable: 'notification_preferences',
  prefsUserId: 'user_id',
  prefsFrequency: 'digest_frequency',
  prefsCategories: 'digest_categories',
  notificationsTable: 'notifications',
  notifUserId: 'user_id',
  notifCategory: 'category',
  notifTitle: 'title',
  notifBody: 'body',
  notifCreatedAt: 'created_at',
} as const;

export interface DigestItem {
  id: string;
  category: string;
  title: string;
  body: string;
  createdAt: Date;
}

export interface DigestPayload {
  userId: string;
  frequency: DigestFrequency;
  windowStart: Date;
  windowEnd: Date;
  items: DigestItem[];
}

export interface DigestSender {
  send(payload: DigestPayload): Promise<void>;
}

export const DIGEST_SENDER = Symbol('DIGEST_SENDER');
