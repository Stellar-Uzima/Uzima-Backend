import { PriorityService, TaskPriority } from './priority.service';

describe('PriorityService', () => {
  let service: PriorityService;

  beforeEach(() => {
    service = new PriorityService();
  });

  describe('resolvePriority', () => {
    it('returns explicitly provided priority', () => {
      const now = new Date('2026-04-23T10:00:00.000Z');
      const dueDate = new Date('2026-04-23T18:00:00.000Z');

      const result = service.resolvePriority(TaskPriority.HIGH, dueDate, now);

      expect(result).toBe(TaskPriority.HIGH);
    });

    it('auto-prioritizes when priority is not provided', () => {
      const now = new Date('2026-04-23T10:00:00.000Z');
      const dueDate = new Date('2026-04-24T08:00:00.000Z');

      const result = service.resolvePriority(undefined, dueDate, now);

      expect(result).toBe(TaskPriority.URGENT);
    });
  });

  describe('autoPrioritize', () => {
    const now = new Date('2026-04-23T10:00:00.000Z');

    it('returns medium when due date is missing', () => {
      expect(service.autoPrioritize(undefined, now)).toBe(TaskPriority.MEDIUM);
      expect(service.autoPrioritize(null, now)).toBe(TaskPriority.MEDIUM);
    });

    it('returns medium when due date is invalid', () => {
      expect(service.autoPrioritize('invalid-date', now)).toBe(
        TaskPriority.MEDIUM,
      );
    });

    it('returns urgent for overdue and within 24 hours', () => {
      expect(
        service.autoPrioritize(new Date('2026-04-23T09:00:00.000Z'), now),
      ).toBe(TaskPriority.URGENT);
      expect(
        service.autoPrioritize(new Date('2026-04-24T09:59:59.000Z'), now),
      ).toBe(TaskPriority.URGENT);
    });

    it('returns high when due within 3 days', () => {
      const dueDate = new Date('2026-04-26T09:00:00.000Z');
      expect(service.autoPrioritize(dueDate, now)).toBe(TaskPriority.HIGH);
    });

    it('returns medium when due within 7 days', () => {
      const dueDate = new Date('2026-04-30T09:00:00.000Z');
      expect(service.autoPrioritize(dueDate, now)).toBe(TaskPriority.MEDIUM);
    });

    it('returns low when due after 7 days', () => {
      const dueDate = new Date('2026-05-02T09:00:00.000Z');
      expect(service.autoPrioritize(dueDate, now)).toBe(TaskPriority.LOW);
    });
  });

  describe('sortByPriority', () => {
    it('sorts by priority then nearest due date', () => {
      const now = new Date('2026-04-23T10:00:00.000Z');
      const tasks = [
        {
          id: '4',
          title: 'no due date',
          priority: TaskPriority.HIGH,
        },
        {
          id: '2',
          title: 'high later',
          priority: TaskPriority.HIGH,
          dueDate: '2026-04-25T10:00:00.000Z',
        },
        {
          id: '1',
          title: 'urgent explicit',
          priority: TaskPriority.URGENT,
          dueDate: '2026-04-24T11:00:00.000Z',
        },
        {
          id: '3',
          title: 'high sooner',
          priority: TaskPriority.HIGH,
          dueDate: '2026-04-24T08:00:00.000Z',
        },
      ];

      const result = service.sortByPriority(tasks, now);

      expect(result.map((task) => task.id)).toEqual(['1', '3', '2', '4']);
    });

    it('uses auto-priority when no explicit priority is set', () => {
      const now = new Date('2026-04-23T10:00:00.000Z');
      const tasks = [
        { id: 'A', dueDate: '2026-05-05T10:00:00.000Z' },
        { id: 'B', dueDate: '2026-04-23T12:00:00.000Z' },
      ];

      const result = service.sortByPriority(tasks, now);

      expect(result.map((task) => task.id)).toEqual(['B', 'A']);
    });
  });

  describe('buildOverdueAlert', () => {
    it('returns alert string for overdue task', () => {
      const now = new Date('2026-04-23T10:00:00.000Z');
      const task = {
        id: 'task-1',
        title: 'Take medication',
        dueDate: '2026-04-23T09:00:00.000Z',
      };

      const result = service.buildOverdueAlert(task, now);

      expect(result).toContain('Overdue alert:');
      expect(result).toContain('Take medication');
    });

    it('returns null for non-overdue task', () => {
      const now = new Date('2026-04-23T10:00:00.000Z');
      const task = {
        id: 'task-2',
        dueDate: '2026-04-24T09:00:00.000Z',
      };

      expect(service.buildOverdueAlert(task, now)).toBeNull();
    });
  });
});
