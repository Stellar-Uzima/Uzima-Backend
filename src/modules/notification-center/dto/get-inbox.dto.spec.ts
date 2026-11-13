import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { GetInboxDto, INBOX_MAX_PAGE_SIZE } from './get-inbox.dto';

/**
 * DTO-level validation tests for GetInboxDto.
 *
 * These tests exercise the class-validator decorators directly so we have a
 * compile-time + runtime guarantee that the API layer rejects out-of-bounds
 * page sizes and malformed date strings before they ever reach the service.
 */
describe('GetInboxDto — DTO validation', () => {
  const toDto = (plain: Record<string, unknown>): GetInboxDto =>
    plainToInstance(GetInboxDto, plain);

  // ── Bounded page size ──────────────────────────────────────────────────────

  describe('bounded page size (limit)', () => {
    it(`rejects a limit above INBOX_MAX_PAGE_SIZE (${INBOX_MAX_PAGE_SIZE})`, async () => {
      const dto = toDto({ page: 1, limit: INBOX_MAX_PAGE_SIZE + 1 });
      const errors = await validate(dto);

      const limitError = errors.find((e) => e.property === 'limit');
      expect(limitError).toBeDefined();
      expect(Object.keys(limitError!.constraints ?? {})).toContain('max');
    });

    it('accepts a limit equal to INBOX_MAX_PAGE_SIZE', async () => {
      const dto = toDto({ page: 1, limit: INBOX_MAX_PAGE_SIZE });
      const errors = await validate(dto);

      const limitError = errors.find((e) => e.property === 'limit');
      expect(limitError).toBeUndefined();
    });

    it('rejects a limit of 0 (below minimum of 1)', async () => {
      const dto = toDto({ page: 1, limit: 0 });
      const errors = await validate(dto);

      const limitError = errors.find((e) => e.property === 'limit');
      expect(limitError).toBeDefined();
      expect(Object.keys(limitError!.constraints ?? {})).toContain('min');
    });

    it('accepts a limit of 1 (minimum allowed)', async () => {
      const dto = toDto({ page: 1, limit: 1 });
      const errors = await validate(dto);
      const limitError = errors.find((e) => e.property === 'limit');
      expect(limitError).toBeUndefined();
    });

    it('accepts a typical limit of 20', async () => {
      const dto = toDto({ page: 1, limit: 20 });
      const errors = await validate(dto);
      const limitError = errors.find((e) => e.property === 'limit');
      expect(limitError).toBeUndefined();
    });
  });

  // ── Page number ────────────────────────────────────────────────────────────

  describe('page number', () => {
    it('rejects page=0 (below minimum of 1)', async () => {
      const dto = toDto({ page: 0, limit: 20 });
      const errors = await validate(dto);

      const pageError = errors.find((e) => e.property === 'page');
      expect(pageError).toBeDefined();
    });

    it('accepts page=1', async () => {
      const dto = toDto({ page: 1, limit: 20 });
      const errors = await validate(dto);
      const pageError = errors.find((e) => e.property === 'page');
      expect(pageError).toBeUndefined();
    });

    it('passes with all fields omitted (all are optional)', async () => {
      const dto = toDto({});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  // ── ISO-8601 date validation ───────────────────────────────────────────────

  describe('since / until ISO-8601 validation', () => {
    it('accepts a valid ISO-8601 string for since', async () => {
      const dto = toDto({ since: '2024-01-01T00:00:00.000Z' });
      const errors = await validate(dto);
      const sinceError = errors.find((e) => e.property === 'since');
      expect(sinceError).toBeUndefined();
    });

    it('accepts a valid ISO-8601 string for until', async () => {
      const dto = toDto({ until: '2024-12-31T23:59:59.999Z' });
      const errors = await validate(dto);
      const untilError = errors.find((e) => e.property === 'until');
      expect(untilError).toBeUndefined();
    });

    it('rejects a non-ISO-8601 string for since', async () => {
      const dto = toDto({ since: '01/01/2024' });
      const errors = await validate(dto);

      const sinceError = errors.find((e) => e.property === 'since');
      expect(sinceError).toBeDefined();
      expect(Object.keys(sinceError!.constraints ?? {})).toContain('isIso8601');
    });

    it('rejects a non-ISO-8601 string for until', async () => {
      const dto = toDto({ until: 'not-a-date' });
      const errors = await validate(dto);

      const untilError = errors.find((e) => e.property === 'until');
      expect(untilError).toBeDefined();
      expect(Object.keys(untilError!.constraints ?? {})).toContain('isIso8601');
    });
  });

  // ── unreadOnly coercion ───────────────────────────────────────────────────

  describe('unreadOnly boolean coercion', () => {
    it('coerces the string "true" to boolean true', async () => {
      const dto = toDto({ unreadOnly: 'true' });
      expect(dto.unreadOnly).toBe(true);
      const errors = await validate(dto);
      const err = errors.find((e) => e.property === 'unreadOnly');
      expect(err).toBeUndefined();
    });

    it('coerces the string "false" to boolean false', async () => {
      const dto = toDto({ unreadOnly: 'false' });
      expect(dto.unreadOnly).toBe(false);
      const errors = await validate(dto);
      const err = errors.find((e) => e.property === 'unreadOnly');
      expect(err).toBeUndefined();
    });

    it('treats an empty string as undefined (no filter)', async () => {
      const dto = toDto({ unreadOnly: '' });
      expect(dto.unreadOnly).toBeUndefined();
    });
  });

  // ── INBOX_MAX_PAGE_SIZE constant ──────────────────────────────────────────

  describe('INBOX_MAX_PAGE_SIZE constant', () => {
    it('is exported and equals 50', () => {
      expect(INBOX_MAX_PAGE_SIZE).toBe(50);
    });
  });
});
