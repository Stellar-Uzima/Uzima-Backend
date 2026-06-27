import { Test, TestingModule } from '@nestjs/testing';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { ReportsSchedulerService } from './reports-scheduler.service';
import { ReportsService, ReportType } from './reports.service';
import { AuditService } from '@/audit/audit.service';
import { NotificationService } from '@/notifications/services/notification.service';

describe('ReportsSchedulerService', () => {
  let service: ReportsSchedulerService;
  let schedulerRegistry: SchedulerRegistry;
  let reportsService: ReportsService;
  let auditService: AuditService;
  let notificationService: NotificationService;

  const mockSchedulerRegistry = {
    addCronJob: jest.fn(),
    deleteCronJob: jest.fn(),
    getCronJob: jest.fn(),
  };

  const mockReportsService = {
    getReportByType: jest.fn(),
  };

  const mockAuditService = {
    logAction: jest.fn().mockResolvedValue(undefined),
  };

  const mockNotificationService = {
    createNotification: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsSchedulerService,
        {
          provide: SchedulerRegistry,
          useValue: mockSchedulerRegistry,
        },
        {
          provide: ReportsService,
          useValue: mockReportsService,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: NotificationService,
          useValue: mockNotificationService,
        },
      ],
    }).compile();

    service = module.get<ReportsSchedulerService>(ReportsSchedulerService);
    schedulerRegistry = module.get<SchedulerRegistry>(SchedulerRegistry);
    reportsService = module.get<ReportsService>(ReportsService);
    auditService = module.get<AuditService>(AuditService);
    notificationService = module.get<NotificationService>(NotificationService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('scheduleReport', () => {
    it('should successfully schedule a new report', async () => {
      const name = 'daily-health-report';
      const cronExpression = '0 0 * * *';
      const reportType: ReportType = 'health_summary';
      const recipients = ['user1@example.com', 'user2@example.com'];

      const result = await service.scheduleReport(name, cronExpression, reportType, recipients);

      expect(schedulerRegistry.addCronJob).toHaveBeenCalled();
      expect(auditService.logAction).toHaveBeenCalledWith('system', `Scheduled report ${name} (${reportType})`);
      expect(result).toBeDefined();
      expect(result.name).toBe(name);
      expect(result.reportType).toBe(reportType);
      expect(result.cronExpression).toBe(cronExpression);
      expect(result.recipients).toEqual(recipients);
      expect(result.createdAt).toBeDefined();
    });

    it('should throw error when scheduling a report with duplicate name', async () => {
      const name = 'daily-health-report';
      const cronExpression = '0 0 * * *';
      const reportType: ReportType = 'health_summary';
      const recipients = ['user1@example.com'];

      await service.scheduleReport(name, cronExpression, reportType, recipients);

      await expect(
        service.scheduleReport(name, cronExpression, reportType, recipients),
      ).rejects.toThrow('A scheduled report with this name already exists');
    });

    it('should create CronJob with correct parameters', async () => {
      const name = 'weekly-report';
      const cronExpression = '0 0 * * 0';
      const reportType: ReportType = 'health_summary';
      const recipients = ['user1@example.com'];

      await service.scheduleReport(name, cronExpression, reportType, recipients);

      expect(schedulerRegistry.addCronJob).toHaveBeenCalledWith(
        name,
        expect.any(CronJob),
      );
    });
  });

  describe('executeScheduledReport', () => {
    it('should successfully execute a scheduled report', async () => {
      const name = 'daily-health-report';
      const cronExpression = '0 0 * * *';
      const reportType: ReportType = 'health_summary';
      const recipients = ['user1@example.com'];
      const mockPayload = { data: 'test report data' };

      await service.scheduleReport(name, cronExpression, reportType, recipients);
      mockReportsService.getReportByType.mockResolvedValue(mockPayload);

      await service.executeScheduledReport(name);

      expect(reportsService.getReportByType).toHaveBeenCalledWith(reportType);
      expect(notificationService.createNotification).toHaveBeenCalledTimes(recipients.length);
      expect(notificationService.createNotification).toHaveBeenCalledWith({
        userId: recipients[0],
        type: 'report',
        title: `Scheduled report: ${name}`,
        body: JSON.stringify(mockPayload, null, 2),
      });
      expect(auditService.logAction).toHaveBeenCalledWith(
        'system',
        `Executed scheduled report ${name} and distributed to ${recipients.length} recipient(s)`,
      );
    });

    it('should handle missing scheduled report gracefully', async () => {
      const name = 'non-existent-report';

      await service.executeScheduledReport(name);

      expect(reportsService.getReportByType).not.toHaveBeenCalled();
      expect(notificationService.createNotification).not.toHaveBeenCalled();
    });

    it('should distribute report to all recipients', async () => {
      const name = 'multi-recipient-report';
      const cronExpression = '0 0 * * *';
      const reportType: ReportType = 'health_summary';
      const recipients = ['user1@example.com', 'user2@example.com', 'user3@example.com'];
      const mockPayload = { data: 'test report data' };

      await service.scheduleReport(name, cronExpression, reportType, recipients);
      mockReportsService.getReportByType.mockResolvedValue(mockPayload);

      await service.executeScheduledReport(name);

      expect(notificationService.createNotification).toHaveBeenCalledTimes(recipients.length);
      recipients.forEach((recipient) => {
        expect(notificationService.createNotification).toHaveBeenCalledWith({
          userId: recipient,
          type: 'report',
          title: `Scheduled report: ${name}`,
          body: JSON.stringify(mockPayload, null, 2),
        });
      });
    });
  });

  describe('distributeReport', () => {
    it('should distribute report with provided payload', async () => {
      const reportType: ReportType = 'health_summary';
      const recipients = ['user1@example.com', 'user2@example.com'];
      const title = 'Test Report';
      const payload = { data: 'test payload' };

      const result = await service.distributeReport(reportType, recipients, title, payload);

      expect(reportsService.getReportByType).not.toHaveBeenCalled();
      expect(notificationService.createNotification).toHaveBeenCalledTimes(recipients.length);
      recipients.forEach((recipient) => {
        expect(notificationService.createNotification).toHaveBeenCalledWith({
          userId: recipient,
          type: 'report',
          title,
          body: JSON.stringify(payload, null, 2),
        });
      });
      expect(auditService.logAction).toHaveBeenCalledWith(
        'system',
        `Distributed ${reportType} report to ${recipients.length} recipient(s)`,
      );
      expect(result).toEqual({ message: 'Report distributed successfully', recipients: recipients.length });
    });

    it('should fetch report data when payload is not provided', async () => {
      const reportType: ReportType = 'health_summary';
      const recipients = ['user1@example.com'];
      const title = 'Test Report';
      const mockPayload = { data: 'fetched payload' };

      mockReportsService.getReportByType.mockResolvedValue(mockPayload);

      const result = await service.distributeReport(reportType, recipients, title);

      expect(reportsService.getReportByType).toHaveBeenCalledWith(reportType);
      expect(notificationService.createNotification).toHaveBeenCalledWith({
        userId: recipients[0],
        type: 'report',
        title,
        body: JSON.stringify(mockPayload, null, 2),
      });
      expect(result).toEqual({ message: 'Report distributed successfully', recipients: recipients.length });
    });

    it('should handle empty recipients list', async () => {
      const reportType: ReportType = 'health_summary';
      const recipients: string[] = [];
      const title = 'Test Report';
      const payload = { data: 'test payload' };

      const result = await service.distributeReport(reportType, recipients, title, payload);

      expect(notificationService.createNotification).not.toHaveBeenCalled();
      expect(auditService.logAction).toHaveBeenCalledWith(
        'system',
        `Distributed ${reportType} report to 0 recipient(s)`,
      );
      expect(result).toEqual({ message: 'Report distributed successfully', recipients: 0 });
    });
  });

  describe('getScheduledReport', () => {
    it('should return scheduled report by name', async () => {
      const name = 'daily-health-report';
      const cronExpression = '0 0 * * *';
      const reportType: ReportType = 'health_summary';
      const recipients = ['user1@example.com'];

      await service.scheduleReport(name, cronExpression, reportType, recipients);

      const result = service.getScheduledReport(name);

      expect(result).toBeDefined();
      expect(result.name).toBe(name);
      expect(result.reportType).toBe(reportType);
    });

    it('should return undefined for non-existent report', () => {
      const result = service.getScheduledReport('non-existent-report');

      expect(result).toBeUndefined();
    });
  });

  describe('listSchedules', () => {
    it('should return empty array when no schedules exist', () => {
      const result = service.listSchedules();

      expect(result).toEqual([]);
    });

    it('should return all scheduled reports', async () => {
      const schedule1 = {
        name: 'daily-health-report',
        cronExpression: '0 0 * * *',
        reportType: 'health_summary' as ReportType,
        recipients: ['user1@example.com'],
      };

      const schedule2 = {
        name: 'weekly-report',
        cronExpression: '0 0 * * 0',
        reportType: 'health_summary' as ReportType,
        recipients: ['user2@example.com'],
      };

      await service.scheduleReport(schedule1.name, schedule1.cronExpression, schedule1.reportType, schedule1.recipients);
      await service.scheduleReport(schedule2.name, schedule2.cronExpression, schedule2.reportType, schedule2.recipients);

      const result = service.listSchedules();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe(schedule1.name);
      expect(result[1].name).toBe(schedule2.name);
    });

    it('should return schedules with correct structure', async () => {
      const name = 'daily-health-report';
      const cronExpression = '0 0 * * *';
      const reportType: ReportType = 'health_summary';
      const recipients = ['user1@example.com'];

      await service.scheduleReport(name, cronExpression, reportType, recipients);

      const result = service.listSchedules();

      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('reportType');
      expect(result[0]).toHaveProperty('cronExpression');
      expect(result[0]).toHaveProperty('recipients');
      expect(result[0]).toHaveProperty('createdAt');
    });
  });
});
