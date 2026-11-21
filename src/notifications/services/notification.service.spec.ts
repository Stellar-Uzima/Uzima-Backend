import { NotificationService as LegacyNotificationService } from './notification.service';
import { NotificationService as CanonicalNotificationService } from '../../modules/notification-center/notification.service';
import { NotificationsService } from '../notifications.service';

/**
 * src/notifications/ only keeps historical import paths (#793). These checks
 * guard the one property that matters: the old paths must resolve to the very
 * same classes, because Nest injects by class identity. A copy would silently
 * create a second, separate notification pipeline.
 *
 * Behaviour is tested where it lives:
 * - delivery, preferences and dedup: modules/notification-center/*.spec.ts
 * - FCM push: shared/notifications/services/push-notification.service.spec.ts
 */
describe('legacy notification import paths', () => {
  it('re-exports the canonical NotificationService, not a copy', () => {
    expect(LegacyNotificationService).toBe(CanonicalNotificationService);
  });

  it('keeps the pluralised NotificationsService alias on the same class', () => {
    expect(NotificationsService).toBe(CanonicalNotificationService);
  });
});
