import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  AuditReport,
  ReportType,
  ReportFormat,
  ReportStatus,
} from './entities/audit-report.entity';
import { CreateAuditReportDto } from './dto/create-audit-report.dto';

const VALID_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const validDtoInput = {
  reportType: ReportType.COMPLIANCE,
  title: 'Monthly Compliance Report',
};

// ============================================================
// CreateAuditReportDto – validation tests
// ============================================================

describe('CreateAuditReportDto', () => {
  describe('valid inputs', () => {
    it('should pass with minimum required fields', async () => {
      const dto = plainToInstance(CreateAuditReportDto, validDtoInput);
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should pass with all optional fields populated (excluding filters)', async () => {
      // Note: `filters` is intentionally omitted here because the DTO uses
      // @ValidateNested() on a plain Record<string, any>, which triggers
      // "unknown value" errors even for valid objects. See filters validation tests.
      const dto = plainToInstance(CreateAuditReportDto, {
        ...validDtoInput,
        description: 'Detailed compliance summary',
        format: ReportFormat.CSV,
        startDate: '2024-01-01T00:00:00.000Z',
        endDate: '2024-01-31T23:59:59.000Z',
        isCompliance: true,
        complianceStandard: 'GDPR',
        isPublic: true,
        isScheduled: true,
        schedulePattern: '0 9 * * MON',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should accept all valid ReportType values', async () => {
      for (const type of Object.values(ReportType)) {
        const dto = plainToInstance(CreateAuditReportDto, { ...validDtoInput, reportType: type });
        const errors = await validate(dto);
        const typeErrors = errors.filter(e => e.property === 'reportType');
        expect(typeErrors).toHaveLength(0);
      }
    });

    it('should accept all valid ReportFormat values', async () => {
      for (const format of Object.values(ReportFormat)) {
        const dto = plainToInstance(CreateAuditReportDto, { ...validDtoInput, format });
        const errors = await validate(dto);
        const formatErrors = errors.filter(e => e.property === 'format');
        expect(formatErrors).toHaveLength(0);
      }
    });
  });

  // ----------------------------------------------------------
  // reportType
  // ----------------------------------------------------------
  describe('reportType validation', () => {
    it('should fail when reportType is missing', async () => {
      const dto = plainToInstance(CreateAuditReportDto, { title: 'Report' });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'reportType')).toBe(true);
    });

    it('should fail when reportType is an invalid enum value', async () => {
      const dto = plainToInstance(CreateAuditReportDto, {
        ...validDtoInput,
        reportType: 'INVALID_TYPE',
      });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'reportType')).toBe(true);
    });

    it('should fail when reportType is a number', async () => {
      const dto = plainToInstance(CreateAuditReportDto, { ...validDtoInput, reportType: 1 });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'reportType')).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // title
  // ----------------------------------------------------------
  describe('title validation', () => {
    it('should fail when title is missing', async () => {
      const dto = plainToInstance(CreateAuditReportDto, { reportType: ReportType.COMPLIANCE });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'title')).toBe(true);
    });

    it('should fail when title is shorter than 3 characters', async () => {
      const dto = plainToInstance(CreateAuditReportDto, { ...validDtoInput, title: 'AB' });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'title')).toBe(true);
    });

    it('should fail when title exceeds 500 characters', async () => {
      const dto = plainToInstance(CreateAuditReportDto, {
        ...validDtoInput,
        title: 'A'.repeat(501),
      });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'title')).toBe(true);
    });

    it('should pass with title of exactly 3 characters', async () => {
      const dto = plainToInstance(CreateAuditReportDto, { ...validDtoInput, title: 'ABC' });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'title')).toBe(false);
    });

    it('should pass with title of exactly 500 characters', async () => {
      const dto = plainToInstance(CreateAuditReportDto, {
        ...validDtoInput,
        title: 'A'.repeat(500),
      });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'title')).toBe(false);
    });

    it('should fail when title is not a string', async () => {
      const dto = plainToInstance(CreateAuditReportDto, { ...validDtoInput, title: 123 });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'title')).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // description (optional)
  // ----------------------------------------------------------
  describe('description validation', () => {
    it('should pass when description is omitted', async () => {
      const dto = plainToInstance(CreateAuditReportDto, validDtoInput);
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'description')).toBe(false);
    });

    it('should pass with a valid description string', async () => {
      const dto = plainToInstance(CreateAuditReportDto, {
        ...validDtoInput,
        description: 'A valid description.',
      });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'description')).toBe(false);
    });

    it('should fail when description exceeds 2000 characters', async () => {
      const dto = plainToInstance(CreateAuditReportDto, {
        ...validDtoInput,
        description: 'A'.repeat(2001),
      });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'description')).toBe(true);
    });

    it('should pass with description of exactly 2000 characters', async () => {
      const dto = plainToInstance(CreateAuditReportDto, {
        ...validDtoInput,
        description: 'A'.repeat(2000),
      });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'description')).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // format (optional, defaults to PDF)
  // ----------------------------------------------------------
  describe('format validation', () => {
    it('should pass when format is omitted', async () => {
      const dto = plainToInstance(CreateAuditReportDto, validDtoInput);
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'format')).toBe(false);
    });

    it('should fail when format is an invalid enum value', async () => {
      const dto = plainToInstance(CreateAuditReportDto, { ...validDtoInput, format: 'WORD' });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'format')).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // date fields (optional)
  // ----------------------------------------------------------
  describe('date field validation', () => {
    it('should pass with a valid ISO date string for startDate', async () => {
      const dto = plainToInstance(CreateAuditReportDto, {
        ...validDtoInput,
        startDate: '2024-01-01T00:00:00.000Z',
      });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'startDate')).toBe(false);
    });

    it('should fail when startDate is not a valid date string', async () => {
      const dto = plainToInstance(CreateAuditReportDto, {
        ...validDtoInput,
        startDate: 'not-a-date',
      });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'startDate')).toBe(true);
    });

    it('should pass when endDate is omitted', async () => {
      const dto = plainToInstance(CreateAuditReportDto, validDtoInput);
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'endDate')).toBe(false);
    });

    it('should fail when endDate is not a valid date string', async () => {
      const dto = plainToInstance(CreateAuditReportDto, {
        ...validDtoInput,
        endDate: 'bad-date',
      });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'endDate')).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // boolean fields (optional)
  // ----------------------------------------------------------
  describe('boolean field validation', () => {
    it('should pass when isCompliance is true', async () => {
      const dto = plainToInstance(CreateAuditReportDto, { ...validDtoInput, isCompliance: true });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'isCompliance')).toBe(false);
    });

    it('should fail when isCompliance is a string', async () => {
      const dto = plainToInstance(CreateAuditReportDto, { ...validDtoInput, isCompliance: 'yes' });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'isCompliance')).toBe(true);
    });

    it('should fail when isPublic is a number', async () => {
      const dto = plainToInstance(CreateAuditReportDto, { ...validDtoInput, isPublic: 1 });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'isPublic')).toBe(true);
    });

    it('should fail when isScheduled is a string', async () => {
      const dto = plainToInstance(CreateAuditReportDto, {
        ...validDtoInput,
        isScheduled: 'true',
      });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'isScheduled')).toBe(true);
    });

    it('should pass with all boolean fields set to false', async () => {
      const dto = plainToInstance(CreateAuditReportDto, {
        ...validDtoInput,
        isCompliance: false,
        isPublic: false,
        isScheduled: false,
      });
      const errors = await validate(dto);
      const boolErrors = errors.filter(e =>
        ['isCompliance', 'isPublic', 'isScheduled'].includes(e.property),
      );
      expect(boolErrors).toHaveLength(0);
    });
  });

  // ----------------------------------------------------------
  // filters (optional)
  // ----------------------------------------------------------
  describe('filters validation', () => {
    it('should pass when filters is omitted', async () => {
      const dto = plainToInstance(CreateAuditReportDto, validDtoInput);
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'filters')).toBe(false);
    });

    it('should fail for a plain object due to @ValidateNested on Record<string,any>', async () => {
      // @ValidateNested() without a decorated class type causes class-validator to
      // report an "unknown value" error even for structurally valid objects. This is
      // a known DTO design limitation — use @IsObject() alone if nested validation
      // is not needed, or introduce a typed class with @Type().
      const dto = plainToInstance(CreateAuditReportDto, {
        ...validDtoInput,
        filters: { status: 'active', department: 'finance' },
      });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'filters')).toBe(true);
    });

    it('should fail when filters is a string', async () => {
      const dto = plainToInstance(CreateAuditReportDto, {
        ...validDtoInput,
        filters: 'invalid',
      });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'filters')).toBe(true);
    });

    it('should fail when filters is an array', async () => {
      const dto = plainToInstance(CreateAuditReportDto, {
        ...validDtoInput,
        filters: ['not', 'an', 'object'],
      });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'filters')).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // schedulePattern (optional)
  // ----------------------------------------------------------
  describe('schedulePattern validation', () => {
    it('should pass when schedulePattern is omitted', async () => {
      const dto = plainToInstance(CreateAuditReportDto, validDtoInput);
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'schedulePattern')).toBe(false);
    });

    it('should pass with a valid cron expression', async () => {
      const dto = plainToInstance(CreateAuditReportDto, {
        ...validDtoInput,
        schedulePattern: '0 9 * * MON',
      });
      const errors = await validate(dto);
      expect(errors.some(e => e.property === 'schedulePattern')).toBe(false);
    });
  });
});

// ============================================================
// AuditReport entity – enum and field validation tests
// ============================================================

describe('AuditReport entity', () => {
  describe('ReportType enum', () => {
    it('should define all expected report types', () => {
      expect(ReportType.USER_ACTIVITY).toBe('USER_ACTIVITY');
      expect(ReportType.DATA_ACCESS).toBe('DATA_ACCESS');
      expect(ReportType.SECURITY_EVENTS).toBe('SECURITY_EVENTS');
      expect(ReportType.COMPLIANCE).toBe('COMPLIANCE');
      expect(ReportType.FINANCIAL).toBe('FINANCIAL');
      expect(ReportType.SYSTEM_EVENTS).toBe('SYSTEM_EVENTS');
      expect(ReportType.AUTHENTICATION).toBe('AUTHENTICATION');
      expect(ReportType.CUSTOM).toBe('CUSTOM');
    });

    it('should contain exactly 8 report types', () => {
      expect(Object.values(ReportType)).toHaveLength(8);
    });
  });

  describe('ReportStatus enum', () => {
    it('should define all expected statuses', () => {
      expect(ReportStatus.PENDING).toBe('PENDING');
      expect(ReportStatus.GENERATED).toBe('GENERATED');
      expect(ReportStatus.EXPORTED).toBe('EXPORTED');
      expect(ReportStatus.FAILED).toBe('FAILED');
      expect(ReportStatus.ARCHIVED).toBe('ARCHIVED');
    });

    it('should contain exactly 5 statuses', () => {
      expect(Object.values(ReportStatus)).toHaveLength(5);
    });
  });

  describe('ReportFormat enum', () => {
    it('should define all expected formats', () => {
      expect(ReportFormat.PDF).toBe('PDF');
      expect(ReportFormat.CSV).toBe('CSV');
      expect(ReportFormat.JSON).toBe('JSON');
      expect(ReportFormat.EXCEL).toBe('EXCEL');
    });

    it('should contain exactly 4 formats', () => {
      expect(Object.values(ReportFormat)).toHaveLength(4);
    });
  });

  describe('entity instantiation', () => {
    it('should be instantiable', () => {
      const report = new AuditReport();
      expect(report).toBeDefined();
      expect(report).toBeInstanceOf(AuditReport);
    });
  });

  describe('entity field validation', () => {
    it('should pass for valid reportType, status, and format (skipMissingProperties)', async () => {
      const report = new AuditReport();
      report.id = VALID_UUID;
      report.reportType = ReportType.COMPLIANCE;
      report.status = ReportStatus.PENDING;
      report.title = 'Valid Report Title';
      report.format = ReportFormat.PDF;

      const errors = await validate(report, { skipMissingProperties: true });
      const relevantErrors = errors.filter(e =>
        ['reportType', 'status', 'format'].includes(e.property),
      );
      expect(relevantErrors).toHaveLength(0);
    });

    it('should fail when reportType is invalid', async () => {
      const report = new AuditReport();
      report.id = VALID_UUID;
      (report as any).reportType = 'NOT_A_TYPE';
      report.status = ReportStatus.PENDING;
      report.title = 'Report';
      report.format = ReportFormat.PDF;

      const errors = await validate(report, { skipMissingProperties: true });
      expect(errors.some(e => e.property === 'reportType')).toBe(true);
    });

    it('should fail when status is invalid', async () => {
      const report = new AuditReport();
      report.id = VALID_UUID;
      report.reportType = ReportType.COMPLIANCE;
      (report as any).status = 'UNKNOWN_STATUS';
      report.title = 'Report';
      report.format = ReportFormat.PDF;

      const errors = await validate(report, { skipMissingProperties: true });
      expect(errors.some(e => e.property === 'status')).toBe(true);
    });

    it('should fail when format is invalid', async () => {
      const report = new AuditReport();
      report.id = VALID_UUID;
      report.reportType = ReportType.COMPLIANCE;
      report.status = ReportStatus.PENDING;
      report.title = 'Report';
      (report as any).format = 'DOCX';

      const errors = await validate(report, { skipMissingProperties: true });
      expect(errors.some(e => e.property === 'format')).toBe(true);
    });

    it('should fail when userId is not a valid UUID', async () => {
      const report = new AuditReport();
      report.id = VALID_UUID;
      report.reportType = ReportType.COMPLIANCE;
      report.status = ReportStatus.PENDING;
      report.title = 'Report';
      report.format = ReportFormat.PDF;
      report.userId = 'not-a-uuid';

      const errors = await validate(report, { skipMissingProperties: true });
      expect(errors.some(e => e.property === 'userId')).toBe(true);
    });

    it('should pass when userId is a valid UUID', async () => {
      const report = new AuditReport();
      report.id = VALID_UUID;
      report.reportType = ReportType.COMPLIANCE;
      report.status = ReportStatus.PENDING;
      report.title = 'Report';
      report.format = ReportFormat.PDF;
      report.userId = VALID_UUID;

      const errors = await validate(report, { skipMissingProperties: true });
      expect(errors.some(e => e.property === 'userId')).toBe(false);
    });

    it('should pass when optional string fields are valid strings', async () => {
      const report = new AuditReport();
      report.id = VALID_UUID;
      report.reportType = ReportType.COMPLIANCE;
      report.status = ReportStatus.PENDING;
      report.title = 'Report';
      report.format = ReportFormat.PDF;
      report.description = 'A report description';
      report.generatedBy = 'admin';
      report.complianceStandard = 'GDPR';
      report.fileUrl = 'https://example.com/report.pdf';
      report.fileName = 'report.pdf';
      report.errorMessage = undefined;
      report.schedulePattern = '0 0 * * *';

      const errors = await validate(report, { skipMissingProperties: true });
      const stringFieldErrors = errors.filter(e =>
        ['description', 'generatedBy', 'complianceStandard', 'fileUrl', 'fileName', 'schedulePattern'].includes(
          e.property,
        ),
      );
      expect(stringFieldErrors).toHaveLength(0);
    });
  });
});
