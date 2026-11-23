import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

/**
 * Narrows an unknown caught value to a human-readable message.
 * Handles native Error instances as well as non-Error throwables
 * (strings, objects with a `message` property, etc.) without
 * relying on `any`.
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unknown error';
}

@Injectable()
export class PushNotificationService implements OnModuleInit {
  private readonly logger = new Logger(PushNotificationService.name);
  private firebaseApp: admin.app.App | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.logger.log('Initializing FCM push notification service...');
    try {
      const serviceAccountPath = this.configService.get<string>('FIREBASE_CREDENTIALS_PATH');
      const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
      const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
      const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY');

      if (admin.apps.length > 0) {
        this.firebaseApp = admin.apps[0];
        this.logger.log('FCM successfully re-used existing Firebase app.');
        return;
      }

      if (serviceAccountPath) {
        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.cert(serviceAccountPath),
        });
        this.logger.log('FCM successfully initialized with service account file path.');
      } else if (projectId && clientEmail && privateKey) {
        const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');
        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey: formattedPrivateKey,
          }),
        });
        this.logger.log('FCM successfully initialized with in-memory service account credentials.');
      } else {
        // Fallback for local development or testing when no FCM credentials are present
        this.logger.warn(
          'No Firebase credentials provided. FCM push notification service is running in mock/offline mode.'
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        `FCM initialization failed: ${getErrorMessage(error)}. Running in offline/mock mode.`
      );
    }
  }

  /**
   * Sends a push notification to a device token using FCM.
   * If the send fails, we log it and don't break the notification flow.
   */
  async sendPushNotification(
    token: string,
    title: string,
    body: string,
    data: Record<string, string> = {}
  ): Promise<boolean> {
    const result = await this.sendPushNotificationWithStatus(token, title, body, data);
    return result.sent;
  }

  async sendPushNotificationWithStatus(
    token: string,
    title: string,
    body: string,
    data: Record<string, string> = {},
  ): Promise<{ sent: boolean; permanentFailure: boolean }> {
    if (!token) {
      this.logger.warn('FCM token is empty, skipping push notification');
      return { sent: false, permanentFailure: true };
    }

    this.logger.log(
      `Attempting to send push notification via FCM to token: ${token.substring(0, 10)}...`
    );

    if (!this.firebaseApp) {
      // Mock mode
      this.logger.log(
        `[MOCK FCM] Push notification sent to token: ${token} - Title: ${title}, Body: ${body}`
      );
      return { sent: true, permanentFailure: false };
    }

    try {
      const response = await this.firebaseApp.messaging().send({
        token,
        notification: {
          title,
          body,
        },
        data,
      });
      this.logger.log(`FCM push notification sent successfully, messageId: ${response}`);
      return { sent: true, permanentFailure: false };
    } catch (error: unknown) {
      this.logger.error(
        `FCM push notification delivery failed for token ${token}: ${getErrorMessage(error)}`
      );
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code: unknown }).code)
          : '';
      const permanentFailure = new Set([
        'messaging/registration-token-not-registered',
        'messaging/invalid-registration-token',
        'messaging/invalid-argument',
      ]).has(code);
      // Failed pushes don't break the notification flow. Permanent provider
      // failures are returned so the subscription can be disabled.
      return { sent: false, permanentFailure };
    }
  }
}
