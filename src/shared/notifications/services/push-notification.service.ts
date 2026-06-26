import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

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
        this.logger.warn('No Firebase credentials provided. FCM push notification service is running in mock/offline mode.');
      }
    } catch (error: any) {
      this.logger.error(`FCM initialization failed: ${error.message}. Running in offline/mock mode.`);
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
    data: Record<string, string> = {},
  ): Promise<boolean> {
    if (!token) {
      this.logger.warn('FCM token is empty, skipping push notification');
      return false;
    }

    this.logger.log(`Attempting to send push notification via FCM to token: ${token.substring(0, 10)}...`);

    if (!this.firebaseApp) {
      // Mock mode
      this.logger.log(`[MOCK FCM] Push notification sent to token: ${token} - Title: ${title}, Body: ${body}`);
      return true;
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
      return true;
    } catch (error: any) {
      this.logger.error(`FCM push notification delivery failed for token ${token}: ${error.message}`);
      // Failed pushes are logged and don't break the notification flow (returns false instead of throwing)
      return false;
    }
  }
}
