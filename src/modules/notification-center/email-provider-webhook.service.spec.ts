import { UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { EmailProviderWebhookService } from './email-provider-webhook.service';
import { EmailProviderWebhookController } from './email-provider-webhook.controller';

const SECRET = 'test-email-webhook-secret';
const NOTIFICATION_ID = '3f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b';
const DELIVERY_LOG_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

const sign = (body: string): string => createHmac('sha256', SECRET).update(body).digest('hex');

const currentTimestamp = (): string => String(Math.floor(Date.now() / 1000));

describe('EmailProviderWebhookService', () => {
  let service: EmailProviderWebhookService;
  let eventsRepo: any;
  let notificationsRepo: any;
  let deliveryLogsRepo: any;
  let config: any;

  const deliver = (body: unknown, signature = sign(JSON.stringify(body)), timestamp?: string) =>
    service.handle(Buffer.from(JSON.stringify(body)), signature, timestamp, body);

  beforeEach(() => {
    eventsRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((dto) => ({ id: 'stored-1', ...dto })),
      save: jest.fn().mockImplementation(async (event) => event),
    };
    notificationsRepo = {
      findOne: jest.fn().mockResolvedValue({ id: NOTIFICATION_ID }),
    };
    deliveryLogsRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    config = {
      get: jest.fn((key: string, fallback?: unknown) =>
        key === 'EMAIL_PROVIDER_WEBHOOK_SECRET' ? SECRET : fallback
      ),
    };

    service = new EmailProviderWebhookService(
      eventsRepo,
      notificationsRepo,
      deliveryLogsRepo,
      config
    );
  });

  it('records an acceptance event and correlates it to the notification', async () => {
    const body = {
      id: 'provider-event-1',
      type: 'email.accepted',
      messageId: 'msg-1',
      metadata: { notificationId: NOTIFICATION_ID },
      timestamp: 1730000000,
    };

    const result = await deliver(body);

    expect(result.accepted).toBe(true);
    expect(result.results[0]).toEqual(
      expect.objectContaining({
        duplicate: false,
        eventId: 'provider-event-1',
        eventType: 'accepted',
        notificationId: NOTIFICATION_ID,
      })
    );
    expect(eventsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'email',
        providerEventId: 'provider-event-1',
        eventType: 'accepted',
        notificationId: NOTIFICATION_ID,
        providerMessageId: 'msg-1',
        occurredAt: new Date(1730000000 * 1000),
      })
    );
  });

  it('records a delivery event and correlates through the delivery log id', async () => {
    deliveryLogsRepo.findOne.mockResolvedValue({
      id: DELIVERY_LOG_ID,
      notificationId: NOTIFICATION_ID,
    });

    const result = await deliver({
      id: 'provider-event-2',
      event: 'delivered',
      deliveryLogId: DELIVERY_LOG_ID,
    });

    expect(result.results[0].eventType).toBe('delivered');
    expect(result.results[0].notificationId).toBe(NOTIFICATION_ID);
    expect(eventsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryLogId: DELIVERY_LOG_ID,
        notificationId: NOTIFICATION_ID,
      })
    );
  });

  it('is idempotent for a duplicate provider callback', async () => {
    const body = { id: 'provider-event-3', type: 'delivered', messageId: 'msg-3' };

    await deliver(body);
    eventsRepo.findOne.mockResolvedValue({
      providerEventId: 'provider-event-3',
      eventType: 'delivered',
      notificationId: null,
    });

    const second = await deliver(body);

    expect(second.results[0].duplicate).toBe(true);
    expect(eventsRepo.save).toHaveBeenCalledTimes(1);
  });

  it('treats a concurrent unique-index violation as a duplicate', async () => {
    eventsRepo.save.mockRejectedValue({ code: '23505' });

    const result = await deliver({ id: 'provider-event-4', type: 'delivered' });

    expect(result.results[0].duplicate).toBe(true);
    expect(result.results[0].eventId).toBe('provider-event-4');
  });

  it('rejects a callback without a signature', async () => {
    const body = { id: 'provider-event-5', type: 'delivered' };

    await expect(
      service.handle(Buffer.from(JSON.stringify(body)), undefined, undefined, body)
    ).rejects.toThrow(UnauthorizedException);
    expect(eventsRepo.save).not.toHaveBeenCalled();
  });

  it('rejects a callback whose body does not match the signature', async () => {
    const body = { id: 'provider-event-6', type: 'delivered' };
    const signature = sign(JSON.stringify({ ...body, id: 'tampered' }));

    await expect(
      service.handle(Buffer.from(JSON.stringify(body)), signature, undefined, body)
    ).rejects.toThrow(UnauthorizedException);
    expect(eventsRepo.save).not.toHaveBeenCalled();
  });

  it('rejects a stale signed timestamp', async () => {
    const body = { id: 'provider-event-7', type: 'delivered' };
    const stale = String(Math.floor(Date.now() / 1000) - 3600);

    await expect(deliver(body, sign(JSON.stringify(body)), stale)).rejects.toThrow(
      UnauthorizedException
    );
  });

  it('accepts a fresh signed timestamp', async () => {
    const body = { id: 'provider-event-8', type: 'delivered' };

    await expect(deliver(body, sign(JSON.stringify(body)), currentTimestamp())).resolves.toEqual(
      expect.objectContaining({ accepted: true })
    );
  });

  it('records the event unlinked when the notification id is unknown', async () => {
    notificationsRepo.findOne.mockResolvedValue(null);

    const result = await deliver({
      id: 'provider-event-9',
      type: 'bounced',
      notificationId: NOTIFICATION_ID,
    });

    expect(result.results[0].notificationId).toBeNull();
    expect(eventsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'bounced', notificationId: null })
    );
  });

  it('normalizes batched events and derives an id when the provider omits one', async () => {
    const body = [
      { type: 'email.delivered', messageId: 'msg-a' },
      { type: 'email.bounced', messageId: 'msg-b' },
    ];

    const result = await deliver(body);

    expect(result.results).toHaveLength(2);
    expect(eventsRepo.save).toHaveBeenCalledTimes(2);
    expect(result.results.map((r) => r.eventType)).toEqual(['delivered', 'bounced']);
    expect(result.results[0].eventId).toHaveLength(64);
  });

  it('records a provider payload without leaking it into logs', async () => {
    const body = {
      id: 'provider-event-10',
      type: 'delivered',
      recipient: 'patient@example.com',
    };

    const logSpy = jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined);

    await deliver(body);

    const logged = logSpy.mock.calls.map((call) => String(call[0])).join(' ');
    expect(logged).toContain('provider-event-10');
    expect(logged).not.toContain('patient@example.com');
  });
});

describe('EmailProviderWebhookController', () => {
  it('forwards the raw body and signature headers to the service', async () => {
    const handle = jest.fn().mockResolvedValue({ accepted: true, results: [] });
    const controller = new EmailProviderWebhookController({ handle } as any);
    const rawBody = Buffer.from('{"id":"evt-1"}');

    await controller.receive(
      {
        rawBody,
        body: { id: 'evt-1' },
      } as any,
      'sha256=abc',
      '1730000000'
    );

    expect(handle).toHaveBeenCalledWith(rawBody, 'sha256=abc', '1730000000', { id: 'evt-1' });
  });
});
