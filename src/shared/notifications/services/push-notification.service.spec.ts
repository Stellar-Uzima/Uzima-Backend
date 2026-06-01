import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PushNotificationService } from './push-notification.service';
import * as admin from 'firebase-admin';

const mockApps: any[] = [];
jest.mock('firebase-admin', () => {
  const mockMessaging = {
    send: jest.fn(),
  };
  const mockApp = {
    messaging: jest.fn(() => mockMessaging),
  };
  return {
    get apps() {
      return mockApps;
    },
    credential: {
      cert: jest.fn(),
    },
    initializeApp: jest.fn(() => {
      const app = mockApp;
      mockApps.push(app);
      return app;
    }),
    app: jest.fn(() => mockApp),
  };
});

describe('PushNotificationService', () => {
  let service: PushNotificationService;
  let configService: ConfigService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset mock apps array by clearing it
    mockApps.length = 0;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushNotificationService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'FIREBASE_PROJECT_ID') return 'test-project';
              if (key === 'FIREBASE_CLIENT_EMAIL') return 'test@email.com';
              if (key === 'FIREBASE_PRIVATE_KEY') return 'test-key';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<PushNotificationService>(PushNotificationService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should initialize firebase-admin certificate when keys are provided', () => {
      // Simulate app not initialized
      mockApps.length = 0;
      (admin.initializeApp as jest.Mock).mockClear();

      service.onModuleInit();
      expect(admin.initializeApp).toHaveBeenCalled();
    });

    it('should fall back to mock mode when credentials are not configured', () => {
      jest.spyOn(configService, 'get').mockReturnValue(null);
      // Clean up apps to simulate no initialization
      mockApps.length = 0;
      (admin.initializeApp as jest.Mock).mockClear();

      service.onModuleInit();
      expect(admin.initializeApp).not.toHaveBeenCalled();
    });
  });

  describe('sendPushNotification', () => {
    it('should return false if token is empty', async () => {
      const result = await service.sendPushNotification('', 'Title', 'Body');
      expect(result).toBe(false);
    });

    it('should send push notification when initialized', async () => {
      // Initialize with test credentials
      service.onModuleInit();

      const mockSend = admin.initializeApp().messaging().send as jest.Mock;
      mockSend.mockResolvedValue('message-id-123');

      const result = await service.sendPushNotification('token-123', 'Title', 'Body');
      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledWith({
        token: 'token-123',
        notification: {
          title: 'Title',
          body: 'Body',
        },
        data: {},
      });
    });

    it('should log and return false when send throws an error', async () => {
      service.onModuleInit();

      const mockSend = admin.initializeApp().messaging().send as jest.Mock;
      mockSend.mockRejectedValue(new Error('FCM network error'));

      const result = await service.sendPushNotification('token-123', 'Title', 'Body');
      expect(result).toBe(false);
    });

    it('should simulate success in mock/offline mode when not initialized', async () => {
      // Run without initialization (firebaseApp = null)
      const result = await service.sendPushNotification('token-123', 'Title', 'Body');
      expect(result).toBe(true);
    });
  });
});
