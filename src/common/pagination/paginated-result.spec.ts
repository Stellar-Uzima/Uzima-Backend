import { PaginatedResult } from './paginated-result';

describe('PaginatedResult', () => {
  describe('of (offset pagination)', () => {
    it('returns totalPages 0 rather than NaN for an empty result set', () => {
      const result = PaginatedResult.of([], 0, { page: 1, limit: 20 });

      expect(result.meta.totalPages).toBe(0);
      expect(Number.isNaN(result.meta.totalPages)).toBe(false);
      expect(result.meta.hasNextPage).toBe(false);
      expect(result.meta.hasPreviousPage).toBe(false);
      expect(result.meta.nextPage).toBeUndefined();
      expect(result.meta.previousPage).toBeUndefined();
    });

    it('returns an empty page for a page beyond the last one without inventing rows', () => {
      const result = PaginatedResult.of([], 137, { page: 99, limit: 20 });

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(137);
      expect(result.meta.totalPages).toBe(7);
      expect(result.meta.hasNextPage).toBe(false);
      expect(result.meta.hasPreviousPage).toBe(true);
    });

    it('computes totalPages with a ceiling', () => {
      expect(PaginatedResult.of([], 40, { page: 1, limit: 20 }).meta.totalPages).toBe(2);
      expect(PaginatedResult.of([], 41, { page: 1, limit: 20 }).meta.totalPages).toBe(3);
    });

    it('exposes hasNextPage only while rows remain', () => {
      const first = PaginatedResult.of(new Array(20).fill('x'), 40, { page: 1, limit: 20 });
      expect(first.meta.hasNextPage).toBe(true);
      expect(first.meta.nextPage).toBe(2);
      expect(first.meta.previousPage).toBeUndefined();

      const last = PaginatedResult.of(new Array(20).fill('x'), 40, { page: 2, limit: 20 });
      expect(last.meta.hasNextPage).toBe(false);
      expect(last.meta.previousPage).toBe(1);
    });

    it('reports the 0-based index window of the page', () => {
      const page2 = PaginatedResult.of(new Array(20).fill('x'), 137, { page: 2, limit: 20 });

      expect(page2.meta.firstItemIndex).toBe(20);
      expect(page2.meta.lastItemIndex).toBe(39);
    });

    it('reports null index bounds for an empty page', () => {
      const empty = PaginatedResult.of([], 137, { page: 3, limit: 20 });

      expect(empty.meta.firstItemIndex).toBeNull();
      expect(empty.meta.lastItemIndex).toBeNull();
    });

    it('treats a non-positive limit as 1 so totalPages cannot be Infinity', () => {
      const result = PaginatedResult.of(['a'], 10, { page: 1, limit: 0 });

      expect(Number.isFinite(result.meta.totalPages)).toBe(true);
    });
  });

  describe('fromCursor (keyset pagination)', () => {
    it('treats the over-fetched row as a next page and trims it from the payload', () => {
      const rows = ['a', 'b', 'c'];
      const result = PaginatedResult.fromCursor(rows, {
        limit: 2,
        encodeCursor: (row) => `cursor:${row}`,
      });

      expect(result.data).toEqual(['a', 'b']);
      expect(result.meta.hasNextPage).toBe(true);
      expect(result.meta.nextCursor).toBe('cursor:b');
    });

    it('reports the final page when the over-fetched row is absent', () => {
      const result = PaginatedResult.fromCursor(['a'], {
        limit: 2,
        encodeCursor: (row) => `cursor:${row}`,
      });

      expect(result.data).toEqual(['a']);
      expect(result.meta.hasNextPage).toBe(false);
      expect(result.meta.nextCursor).toBeUndefined();
    });

    it('reports an empty first page as terminal', () => {
      const result = PaginatedResult.fromCursor([], { limit: 20, encodeCursor: () => 'x' });

      expect(result.data).toEqual([]);
      expect(result.meta.hasNextPage).toBe(false);
      expect(result.meta.hasPreviousPage).toBe(false);
    });
  });

  describe('map', () => {
    it('transforms rows while preserving the page envelope', () => {
      const original = PaginatedResult.of([{ id: '1' }, { id: '2' }], 2, { page: 1, limit: 2 });
      const mapped = original.map((row) => row.id.toUpperCase());

      expect(mapped.data).toEqual(['1', '2']);
      expect(mapped.meta.total).toBe(2);
      expect(mapped.meta.totalPages).toBe(1);
    });
  });
});
