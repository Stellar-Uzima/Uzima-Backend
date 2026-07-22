import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { HealthReportService } from './health-report.service';
import { HealthReport, HealthReportStatus } from './entities/health-report.entity';
import { AggregationService } from './aggregation.service';
import { PdfService } from './pdf.service';
import { StorageService } from '../storage/storage.service';
import { User } from '../entities/user.entity';

describe('HealthReportService', () => {
  let service: HealthReportService;
  let reportRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let userRepo: { findOne: jest.Mock };
  let aggregationService: { aggregateForUser: jest.Mock };
  let pdfService: { generateReportPdf: jest.Mock };
  let storageService: {
    uploadFile: jest.Mock;
    getDownloadUrl: jest.Mock;
    deleteFile: jest.Mock;
  };

  const mockUser: Partial<User> = {
    id: 'user-1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
  };

  const mockAggregation = {
    userId: 'user-1',
    periodStart: '2026-07-13',
    periodEnd: '2026-07-19',
    categoryStats: [{ category: 'fitness', assigned: 5, completed: 4, completionRate: 80 }],
    overallCompletionRate: 80,
    streak: { currentStreak: 3, longestStreakInPeriod: 3 },
    badgesEarned: [],
    consultations: { totalScheduled: 1, completed: 1, cancelled: 0 },
    insight: 'Great week!',
  };

  beforeEach(async () => {
    reportRepo = {
      findOne: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn((data) => Promise.resolve({ id: 'report-1', ...data })),
    };
    userRepo = { findOne: jest.fn() };
    aggregationService = { aggregateForUser: jest.fn() };
    pdfService = { generateReportPdf: jest.fn() };
    storageService = {
      uploadFile: jest.fn(),
      getDownloadUrl: jest.fn(),
      deleteFile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthReportService,
        { provide: getRepositoryToken(HealthReport), useValue: reportRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: AggregationService, useValue: aggregationService },
        { provide: PdfService, useValue: pdfService },
        { provide: StorageService, useValue: storageService },
      ],
    }).compile();

    service = module.get<HealthReportService>(HealthReportService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findOrCreatePendingReport', () => {
    it('returns an existing report for the period instead of creating a duplicate', async () => {
      const existing = {
        id: 'existing-report',
        userId: 'user-1',
        periodStart: '2026-07-13',
        periodEnd: '2026-07-19',
        status: HealthReportStatus.READY,
      };
      reportRepo.findOne.mockResolvedValue(existing);

      const result = await service.findOrCreatePendingReport(
        'user-1',
        new Date('2026-07-13T00:00:00Z'),
        new Date('2026-07-19T23:59:59Z')
      );

      expect(result).toBe(existing);
      expect(reportRepo.create).not.toHaveBeenCalled();
    });

    it('creates a new pending report when none exists for the period', async () => {
      reportRepo.findOne.mockResolvedValue(null);

      const result = await service.findOrCreatePendingReport(
        'user-1',
        new Date('2026-07-13T00:00:00Z'),
        new Date('2026-07-19T23:59:59Z')
      );

      expect(reportRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          periodStart: '2026-07-13',
          periodEnd: '2026-07-19',
          status: HealthReportStatus.PENDING,
        })
      );
      expect(result).toEqual(expect.objectContaining({ status: HealthReportStatus.PENDING }));
    });
  });

  describe('generateReport', () => {
    const pendingReport = {
      id: 'report-1',
      userId: 'user-1',
      periodStart: '2026-07-13',
      periodEnd: '2026-07-19',
      status: HealthReportStatus.PENDING,
    };

    it('aggregates data, renders a PDF, uploads it, and marks the report ready', async () => {
      reportRepo.findOne.mockResolvedValue({ ...pendingReport });
      userRepo.findOne.mockResolvedValue(mockUser);
      aggregationService.aggregateForUser.mockResolvedValue(mockAggregation);
      pdfService.generateReportPdf.mockResolvedValue(Buffer.from('pdf-bytes'));
      storageService.uploadFile.mockResolvedValue('health-reports/user-1/report.pdf');

      const result = await service.generateReport('report-1');

      expect(aggregationService.aggregateForUser).toHaveBeenCalledWith(
        'user-1',
        expect.any(Date),
        expect.any(Date)
      );
      expect(pdfService.generateReportPdf).toHaveBeenCalledWith(mockAggregation, 'Ada Lovelace');
      expect(storageService.uploadFile).toHaveBeenCalled();
      expect(result.status).toBe(HealthReportStatus.READY);
      expect(result.storageKey).toBe('health-reports/user-1/report.pdf');
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('marks the report failed and cleans up storage if PDF generation throws after upload', async () => {
      reportRepo.findOne.mockResolvedValue({ ...pendingReport });
      userRepo.findOne.mockResolvedValue(mockUser);
      aggregationService.aggregateForUser.mockResolvedValue(mockAggregation);
      pdfService.generateReportPdf.mockResolvedValue(Buffer.from('pdf-bytes'));
      storageService.uploadFile.mockResolvedValue('health-reports/user-1/report.pdf');

      // Simulate a downstream failure (e.g. a save error) after upload succeeded
      reportRepo.save.mockImplementationOnce((data) =>
        Promise.resolve({ id: 'report-1', ...data })
      );
      reportRepo.save.mockImplementationOnce(() => {
        throw new Error('DB write failed');
      });

      await expect(service.generateReport('report-1')).rejects.toThrow('DB write failed');

      expect(storageService.deleteFile).toHaveBeenCalledWith('health-reports/user-1/report.pdf');
    });

    it('marks the report failed without attempting cleanup if upload never happened', async () => {
      reportRepo.findOne.mockResolvedValue({ ...pendingReport });
      userRepo.findOne.mockResolvedValue(mockUser);
      aggregationService.aggregateForUser.mockRejectedValue(new Error('Aggregation failed'));

      await expect(service.generateReport('report-1')).rejects.toThrow('Aggregation failed');

      expect(storageService.deleteFile).not.toHaveBeenCalled();
      expect(reportRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: HealthReportStatus.FAILED,
          failureReason: 'Aggregation failed',
        })
      );
    });

    it('throws NotFoundException if the report does not exist', async () => {
      reportRepo.findOne.mockResolvedValue(null);

      await expect(service.generateReport('missing-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDownloadUrl', () => {
    it('returns a signed URL for the owner of a ready, unexpired report', async () => {
      const future = new Date(Date.now() + 1000 * 60 * 60);
      reportRepo.findOne.mockResolvedValue({
        id: 'report-1',
        userId: 'user-1',
        status: HealthReportStatus.READY,
        storageKey: 'health-reports/user-1/report.pdf',
        expiresAt: future,
      });
      storageService.getDownloadUrl.mockResolvedValue('https://signed-url.example.com');

      const url = await service.getDownloadUrl('report-1', 'user-1');

      expect(url).toBe('https://signed-url.example.com');
      expect(storageService.getDownloadUrl).toHaveBeenCalledWith(
        'health-reports/user-1/report.pdf',
        3600
      );
    });

    it('throws ForbiddenException (403) when requested by a non-owner', async () => {
      reportRepo.findOne.mockResolvedValue({
        id: 'report-1',
        userId: 'user-1',
        status: HealthReportStatus.READY,
        storageKey: 'key',
        expiresAt: new Date(Date.now() + 10000),
      });

      await expect(service.getDownloadUrl('report-1', 'someone-else')).rejects.toThrow(
        ForbiddenException
      );
    });

    it('throws 410 Gone when the download window has expired', async () => {
      const past = new Date(Date.now() - 1000 * 60 * 60);
      reportRepo.findOne.mockResolvedValue({
        id: 'report-1',
        userId: 'user-1',
        status: HealthReportStatus.READY,
        storageKey: 'key',
        expiresAt: past,
      });

      try {
        await service.getDownloadUrl('report-1', 'user-1');
        fail('Expected an exception to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(HttpStatus.GONE);
      }
    });

    it('throws NotFoundException if the report is not yet ready', async () => {
      reportRepo.findOne.mockResolvedValue({
        id: 'report-1',
        userId: 'user-1',
        status: HealthReportStatus.GENERATING,
        storageKey: null,
        expiresAt: null,
      });

      await expect(service.getDownloadUrl('report-1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });
});
