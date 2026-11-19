import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SearchTasksDto, SortOrder, TaskSortField } from './search-tasks.dto';
import { TaskCategory } from '../../../tasks/entities/health-task.entity';
import { TaskStatus } from '../../../tasks/enums/task-status.enum';

const build = (input: Record<string, unknown>) => plainToInstance(SearchTasksDto, input);

const errorsFor = async (input: Record<string, unknown>) =>
  validate(build(input), { whitelist: true, forbidNonWhitelisted: true });

describe('SearchTasksDto (#1502)', () => {
  it('applies pagination and sort defaults when nothing is supplied', () => {
    const dto = build({});

    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
    expect(dto.sortBy).toBe(TaskSortField.CREATED_AT);
    expect(dto.sortOrder).toBe(SortOrder.DESC);
  });

  it('accepts state, category and a well-ordered date range together', async () => {
    const errors = await errorsFor({
      status: TaskStatus.ACTIVE,
      category: TaskCategory.FITNESS,
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-06-30T23:59:59.999Z',
    });

    expect(errors).toHaveLength(0);
  });

  it('trims the free-text query', () => {
    expect(build({ query: '  water  ' }).query).toBe('water');
  });

  it.each([
    ['unknown status', { status: 'pending' }],
    ['unknown category', { category: 'cardio' }],
    ['unparseable startDate', { startDate: 'not-a-date' }],
    ['unparseable endDate', { endDate: '31/12/2026' }],
    ['unsupported sort column', { sortBy: 'password' }],
    ['unsupported sort order', { sortOrder: 'sideways' }],
    ['page below 1', { page: 0 }],
    ['non-integer page', { page: 1.5 }],
    ['limit above the maximum', { limit: 101 }],
  ])('rejects %s', async (_label, input) => {
    const errors = await errorsFor(input);

    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a backwards date range', async () => {
    const errors = await errorsFor({
      startDate: '2026-07-01T00:00:00.000Z',
      endDate: '2026-01-01T00:00:00.000Z',
    });

    expect(errors.map((e) => e.property)).toContain('endDate');
  });

  it('rejects a client-supplied createdBy so scoping cannot be overridden', async () => {
    const errors = await errorsFor({ createdBy: 'someone-else' });

    expect(errors.map((e) => e.property)).toContain('createdBy');
  });
});
