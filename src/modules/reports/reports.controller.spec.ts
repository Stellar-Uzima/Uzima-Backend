import { Test, TestingModule } from '@nestjs/testing';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportExportService } from './report-export.service';
import { ReportsSchedulerService } from './reports-scheduler.service';

describe('ReportsController', () => {
  let controller: ReportsController;
  let reportsService: ReportsService;
  let reportExportService: ReportExportService;
  let schedulerService: ReportsSchedulerService;

  const mockReportsService = {
    getUserReport: jest.fn(),
    getActivityReport: jest.fn(),
    getHealthReport: jest.fn(),
    getReportByType: jest.fn(),
    generateReportCsv: jest.fn(),
  };

  const mockReportExportService = {
    streamRewardsCsv: jest.fn(),
  };

  const mockSchedulerService = {
    scheduleReport: jest.fn(),
    listSchedules: jest.fn(),
    distributeReport: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        { provide: ReportsService, useValue: mockReportsService },
        { provide: ReportExportService, useValue: mockReportExportService },
        { provide: ReportsSchedulerService, useValue: mockSchedulerService },
      ],
    }).compile();

    controller = module.get<ReportsController>(ReportsController);
    reportsService = module.get<ReportsService>(ReportsService);
    reportExportService = module.get<ReportExportService>(ReportExportService);
    schedulerService = module.get<ReportsSchedulerService>(ReportsSchedulerService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ============================================
  // REPORT RETRIEVAL TESTS
  // ============================================

  describe('Report Retrieval', () => {
    it('should get user report', async () => {
      const mockUserReport = {
        totalUsers: 100,
        activeUsers: 80,
        usersLast30Days: 20,
        roleBreakdown: [],
        topCountries: [],
      };

      mockReportsService.getUserReport.mockResolvedValue(mockUserReport);

      const result = await controller.getUserReport();

      expect(result).toEqual(mockUserReport);
      expect(mockReportsService.getUserReport).toHaveBeenCalled();
    });

    it('should get activity report', async () => {
      const mockActivityReport = {
        statusTotals: { completed: 50, pending: 10 },
        completedLast7Days: 20,
        totalRewardsDistributed: 5000,
      };

      mockReportsService.getActivityReport.mockResolvedValue(mockActivityReport);

      const result = await controller.getActivityReport();

      expect(result).toEqual(mockActivityReport);
      expect(mockReportsService.getActivityReport).toHaveBeenCalled();
    });

    it('should get health report', async () => {
      const mockHealthReport = {
        activeUsers: 80,
        completedTasksLast30Days: 500,
        uniqueUsersCompletingTasks: 60,
        averageTasksPerActiveUser: 6.25,
      };

      mockReportsService.getHealthReport.mockResolvedValue(mockHealthReport);

      const result = await controller.getHealthReport();

      expect(result).toEqual(mockHealthReport);
      expect(mockReportsService.getHealthReport).toHaveBeenCalled();
    });
  });

  // ============================================
  // CSV EXPORT TESTS
  // ============================================

  describe('CSV Export', () => {
    it('should export users report as CSV', async () => {
      const mockCsv = 'Metric,Value\nTotal Users,100';
      mockReportsService.generateReportCsv.mockResolvedValue(mockCsv);

      const mockResponse = {
        setHeader: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await controller.exportReport('users', mockResponse as any);

      expect(mockReportsService.generateReportCsv).toHaveBeenCalledWith('users');
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/csv; charset=utf-8',
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('report-users-'),
      );
      expect(mockResponse.send).toHaveBeenCalledWith(mockCsv);
    });

    it('should export activity report as CSV', async () => {
      const mockCsv = 'Metric,Value\nTotal Rewards,5000';
      mockReportsService.generateReportCsv.mockResolvedValue(mockCsv);

      const mockResponse = {
        setHeader: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await controller.exportReport('activity', mockResponse as any);

      expect(mockReportsService.generateReportCsv).toHaveBeenCalledWith('activity');
      expect(mockResponse.send).toHaveBeenCalledWith(mockCsv);
    });

    it('should export health report as CSV', async () => {
      const mockCsv = 'Metric,Value\nActive Users,80';
      mockReportsService.generateReportCsv.mockResolvedValue(mockCsv);

      const mockResponse = {
        setHeader: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await controller.exportReport('health', mockResponse as any);

      expect(mockReportsService.generateReportCsv).toHaveBeenCalledWith('health');
      expect(mockResponse.send).toHaveBeenCalledWith(mockCsv);
    });

    it('should default to users report when type is not specified', async () => {
      const mockCsv = 'Metric,Value';
      mockReportsService.generateReportCsv.mockResolvedValue(mockCsv);

      const mockResponse = {
        setHeader: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await controller.exportReport(undefined, mockResponse as any);

      expect(mockReportsService.generateReportCsv).toHaveBeenCalledWith('users');
    });

    it('should handle CSV generation errors gracefully', async () => {
      const error = new Error('Database connection failed');
      mockReportsService.generateReportCsv.mockRejectedValue(error);

      const mockResponse = {
        setHeader: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await controller.exportReport('users', mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: 'Failed to generate CSV report',
          error: 'Database connection failed',
        }),
      );
    });

    it('should set correct CSV headers with date in filename', async () => {
      const mockCsv = 'Metric,Value';
      mockReportsService.generateReportCsv.mockResolvedValue(mockCsv);

      const mockResponse = {
        setHeader: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await controller.exportReport('users', mockResponse as any);

      const callArgs = mockResponse.setHeader.mock.calls;
      const dispositionCall = callArgs.find(
        (call) => call[0] === 'Content-Disposition',
      );

      expect(dispositionCall).toBeDefined();
      expect(dispositionCall[1]).toContain('report-users-');
      expect(dispositionCall[1]).toContain('.csv');
    });

    it('should include HTTP 200 status implicitly on successful export', async () => {
      const mockCsv = 'Metric,Value\nTest,Data';
      mockReportsService.generateReportCsv.mockResolvedValue(mockCsv);

      const mockResponse = {
        setHeader: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await controller.exportReport('users', mockResponse as any);

      // On success, should not call status() (defaults to 200)
      expect(mockResponse.status).not.toHaveBeenCalled();
      expect(mockResponse.send).toHaveBeenCalled();
    });
  });

  // ============================================
  // REWARD EXPORT TESTS
  // ============================================

  describe('Reward Export', () => {
    it('should export rewards as CSV by default', async () => {
      const mockStream = {
        pipe: jest.fn(),
      };
      mockReportExportService.streamRewardsCsv.mockReturnValue(mockStream);

      const mockResponse = {
        setHeader: jest.fn(),
        pipe: jest.fn(),
      };

      await controller.exportRewards('csv', mockResponse as any);

      expect(mockReportExportService.streamRewardsCsv).toHaveBeenCalled();
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="rewards-report.csv"',
      );
    });

    it('should export rewards as JSON when format is json', async () => {
      const mockActivityReport = {
        statusTotals: { completed: 50 },
        completedLast7Days: 20,
        totalRewardsDistributed: 5000,
      };
      mockReportsService.getReportByType.mockResolvedValue(mockActivityReport);

      const result = await controller.exportRewards('json', {} as any);

      expect(mockReportsService.getReportByType).toHaveBeenCalledWith('activity');
      expect(result).toEqual(mockActivityReport);
    });
  });

  // ============================================
  // SCHEDULING TESTS
  // ============================================

  describe('Report Scheduling', () => {
    it('should schedule a report', async () => {
      const scheduleDto = {
        name: 'weekly-user-report',
        cronExpression: '0 0 * * 0',
        reportType: 'users' as any,
        recipients: ['admin@example.com'],
      };

      const mockScheduleResult = { id: 'schedule-1', ...scheduleDto };
      mockSchedulerService.scheduleReport.mockResolvedValue(mockScheduleResult);

      const result = await controller.scheduleReport(scheduleDto);

      expect(mockSchedulerService.scheduleReport).toHaveBeenCalledWith(
        'weekly-user-report',
        '0 0 * * 0',
        'users',
        ['admin@example.com'],
      );
      expect(result).toEqual(mockScheduleResult);
    });

    it('should list all schedules', async () => {
      const mockSchedules = [
        { id: 'schedule-1', name: 'weekly-report', reportType: 'users' },
        { id: 'schedule-2', name: 'daily-activity', reportType: 'activity' },
      ];
      mockSchedulerService.listSchedules.mockResolvedValue(mockSchedules);

      const result = await controller.getSchedules();

      expect(mockSchedulerService.listSchedules).toHaveBeenCalled();
      expect(result).toEqual(mockSchedules);
    });

    it('should distribute a report', async () => {
      const distributeDto = {
        reportType: 'users' as any,
        recipients: ['admin@example.com'],
      };

      const mockDistributeResult = { jobId: 'job-1', status: 'queued' };
      mockSchedulerService.distributeReport.mockResolvedValue(mockDistributeResult);

      const result = await controller.distributeReport(distributeDto);

      expect(mockSchedulerService.distributeReport).toHaveBeenCalledWith(
        'users',
        ['admin@example.com'],
        'Manual report distribution: users',
      );
      expect(result).toEqual(mockDistributeResult);
    });
  });
});
