import { Test, TestingModule } from '@nestjs/testing';
import { DataExportProcessor } from './data-export.processor';
import { UsersService } from '../users.service';
import { NotificationService } from '../../../notifications/services/notification.service';
import { StorageService } from '../../../storage/storage.service';

describe('DataExportProcessor', () => {
  let processor: DataExportProcessor;
  let usersService: Partial<UsersService>;
  let storageService: Partial<StorageService>;
  let notificationService: Partial<NotificationService>;

  beforeEach(() => {
    usersService = { getProfile: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.com' }) } as any;
    storageService = { uploadFile: jest.fn().mockResolvedValue('exports/g.json'), getDownloadUrl: jest.fn().mockResolvedValue('https://example.com/file') } as any;
    notificationService = { sendEmail: jest.fn().mockResolvedValue(true) } as any;

    const taskRepo = { find: jest.fn().mockResolvedValue([]) } as any;
    const rewardRepo = { find: jest.fn().mockResolvedValue([]) } as any;
    const notificationRepo = { find: jest.fn().mockResolvedValue([]) } as any;

    processor = new DataExportProcessor(
      usersService as any,
      taskRepo,
      rewardRepo,
      notificationRepo,
      storageService as any,
      notificationService as any,
    );
  });

  it('generates a download url and emails the user', async () => {
    const fakeJob: any = { id: 'j1', data: { userId: 'u1' }, progress: jest.fn() };

    await processor.handleDataExport(fakeJob);

    expect(usersService.getProfile).toHaveBeenCalledWith('u1');
    expect(storageService.uploadFile).toHaveBeenCalled();
    expect(storageService.getDownloadUrl).toHaveBeenCalledWith('exports/g.json', 24 * 3600);
    expect(notificationService.sendEmail).toHaveBeenCalledWith('u1', 'gdpr-export-ready', expect.any(Object));
  });
});
