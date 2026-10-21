import { ChannelRouterService } from './channel-router.service';
import { NotificationTypeEnum } from './entities/in-app-notification.entity';
import { EmailTemplateService } from '../../shared/notifications/services/email-template.service';

const notificationLocales = ['en', 'en-US', 'fr'];
const notificationCases = Object.values(NotificationTypeEnum).flatMap((type) =>
  notificationLocales.map((locale) => [type, locale] as const)
);

describe('ChannelRouterService notification templates', () => {
  let service: ChannelRouterService;
  let emailTemplateService: EmailTemplateService;

  beforeEach(() => {
    const queryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const deliveryLogRepo = {
      create: jest.fn((log) => log),
      save: jest.fn().mockResolvedValue({ id: 'delivery-log-1' }),
      update: jest.fn().mockResolvedValue(undefined),
      manager: { createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) },
    };

    emailTemplateService = new EmailTemplateService();
    service = new ChannelRouterService(
      {} as any,
      {} as any,
      deliveryLogRepo as any,
      { add: jest.fn() } as any,
      {} as any,
      {} as any,
      emailTemplateService
    );
  });

  it.each(notificationCases)(
    'renders the email template for notification type %s and locale %s before delivery',
    async (type, locale) => {
      const render = jest.spyOn(emailTemplateService, 'render');
      await service.route({
        notification: {
          id: 'notification-1',
          type,
          title: 'Health reminder',
          body: 'Your health task is due.',
        } as any,
        user: {
          id: 'user-1',
          email: 'user@example.com',
          firstName: 'Alex',
          preferredLanguage: locale,
        } as any,
        preferences: {
          emailNotifications: true,
          pushNotifications: false,
          smsNotifications: false,
        } as any,
      });

      expect(render).toHaveBeenCalledWith(
        'notification',
        {
          title: 'Health reminder',
          body: 'Your health task is due.',
          firstName: 'Alex',
        },
        locale
      );
      expect(render).toHaveReturned();
      await expect(render.mock.results[0].value).resolves.toContain('Your health task is due.');
    }
  );
});
