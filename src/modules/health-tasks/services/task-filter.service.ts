import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { HealthTask, TaskCategory } from '../../../tasks/entities/health-task.entity';

/**
 * # Task Category Search Filter Contract
 *
 * This interface defines the formal contract for filtering health tasks.
 * Each property represents an optional filter criterion. When multiple
 * filters are provided, they are combined with AND logic.
 *
 * ## Allowed Query Parameters
 *
 * | Parameter    | Type                  | Behavior                                              |
 * |-------------|----------------------|------------------------------------------------------|
 * | `status`    | `string`             | Exact match on task status (e.g. 'active', 'completed') |
 * | `category`  | `TaskCategory` (enum)| Exact match on task category (NUTRITION, EXERCISE, etc.) |
 * | `priority`  | `string`             | Reserved for future use — not currently applied in queries |
 * | `createdBy` | `string` (UUID)      | Exact match on the user ID who created the task |
 * | `isActive`  | `boolean`            | Filters for active (`true`) or inactive (`false`) tasks |
 * | `dateFrom`  | `Date`               | Inclusive lower bound on `createdAt`; tasks created on or after |
 * | `dateTo`    | `Date`               | Inclusive upper bound on `createdAt`; tasks created on or before |
 * | `presetName`| `string`             | Internal use only — not a direct filter; triggers preset lookup |
 *
 * ## Expected Filter Behavior
 *
 * - **Empty request**: Returns all tasks (paginated) when no filters are provided.
 * - **Combination**: When multiple filters are supplied, they combine with AND semantics.
 *   For example, `{ status: 'active', category: 'EXERCISE' }` returns only tasks that
 *   are both active AND in the EXERCISE category.
 * - **Date range**: `dateFrom` and `dateTo` can be used independently or together.
 *   When both are provided, the range is inclusive on both ends.
 * - **Pagination**: Results are always paginated via `page` and `limit` parameters
 *   (default: page=1, limit=10). The response includes `data` and `total` fields.
 * - **Field projection**: Only a subset of fields is returned to optimize performance:
 *   `id`, `title`, `category`, `status`, `xlmReward`, `createdAt`.
 * - **Sort order**: Results are sorted by `createdAt` in descending order (newest first).
 * - **Case sensitivity**: String filters (`status`, `createdBy`) are case-sensitive
 *   exact matches.
 */
export interface TaskFilterOptions {
  /** Exact match on task status (e.g. 'active', 'completed', 'pending') */
  status?: string;
  /** Exact match on task category from the TaskCategory enum */
  category?: TaskCategory;
  /** Reserved for future priority-based filtering — not currently applied */
  priority?: string;
  /** UUID of the user who created the task */
  createdBy?: string;
  /** When `true`, returns only active tasks; when `false`, only inactive; when omitted, both */
  isActive?: boolean;
  /** Inclusive lower bound on task `createdAt` timestamp */
  dateFrom?: Date;
  /** Inclusive upper bound on task `createdAt` timestamp */
  dateTo?: Date;
  /** Internal key used to retrieve a saved filter preset */
  presetName?: string;
}

/**
 * Represents a saved filter preset owned by a specific user.
 * Presets are stored in-memory and are not persisted across server restarts.
 */
export interface FilterPreset {
  /** Unique name for the preset (scoped to the owner) */
  name: string;
  /** UUID of the user who owns this preset */
  ownerId: string;
  /** The filter criteria saved in this preset */
  filters: TaskFilterOptions;
  /** Timestamp when the preset was created */
  createdAt: Date;
}

@Injectable()
export class TaskFilterService {
  /** In-memory preset storage. Not persisted across server restarts. */
  private readonly presets = new Map<string, FilterPreset>();

  constructor(
    @InjectRepository(HealthTask)
    private readonly taskRepo: Repository<HealthTask>,
  ) {}

  /**
   * Filter health tasks based on the provided criteria.
   *
   * @param options - Filter criteria conforming to the TaskFilterOptions contract.
   *                  All properties are optional; omitted filters are not applied.
   * @param page - Page number for pagination (1-based, default: 1).
   * @param limit - Number of results per page (default: 10, minimum: 1).
   * @returns An object containing the paginated `data` array and the `total` count
   *          of matching records (before pagination).
   *
   * @example
   * // Filter by category and status
   * const result = await service.filter({ category: TaskCategory.EXERCISE, status: 'active' });
   *
   * @example
   * // Filter by date range with pagination
   * const result = await service.filter({
   *   dateFrom: new Date('2026-01-01'),
   *   dateTo: new Date('2026-07-01'),
   * }, 2, 20);
   */
  async filter(options: TaskFilterOptions, page: number = 1, limit: number = 10): Promise<{ data: HealthTask[], total: number }> {
    const where: FindOptionsWhere<HealthTask> = {};

    if (options.status) where.status = options.status;
    if (options.category) where.category = options.category;
    if (options.isActive !== undefined) where.isActive = options.isActive;
    if (options.createdBy) where.createdBy = options.createdBy;

    const qb = this.taskRepo.createQueryBuilder('task').where(where);

    if (options.dateFrom && options.dateTo) {
      qb.andWhere('task.createdAt BETWEEN :from AND :to', {
        from: options.dateFrom,
        to: options.dateTo,
      });
    } else if (options.dateFrom) {
      qb.andWhere('task.createdAt >= :from', { from: options.dateFrom });
    } else if (options.dateTo) {
      qb.andWhere('task.createdAt <= :to', { to: options.dateTo });
    }

    // Optimization (#512): Field projection
    qb.select([
      'task.id',
      'task.title',
      'task.category',
      'task.status',
      'task.xlmReward',
      'task.createdAt',
    ]);

    // Pagination (#512)
    qb.skip((page - 1) * limit);
    qb.take(limit);

    const [data, total] = await qb.orderBy('task.createdAt', 'DESC').getManyAndCount();
    return { data, total };
  }

  /**
   * Save a filter preset for later reuse.
   *
   * The preset key is a composite of `ownerId:name`, ensuring uniqueness per user.
   * If a preset with the same name already exists for the owner, it is overwritten.
   *
   * @param name - Unique name for the preset (scoped to ownerId).
   * @param ownerId - UUID of the user who owns the preset.
   * @param filters - The filter criteria to save.
   * @returns The saved FilterPreset.
   */
  savePreset(name: string, ownerId: string, filters: TaskFilterOptions): FilterPreset {
    const key = `${ownerId}:${name}`;
    const preset: FilterPreset = { name, ownerId, filters, createdAt: new Date() };
    this.presets.set(key, preset);
    return preset;
  }

  /**
   * Retrieve a saved filter preset by name and owner.
   *
   * @param name - The preset name to look up.
   * @param ownerId - UUID of the preset owner.
   * @returns The matching FilterPreset, or `null` if not found.
   */
  getPreset(name: string, ownerId: string): FilterPreset | null {
    return this.presets.get(`${ownerId}:${name}`) ?? null;
  }

  /**
   * List all saved presets for a given user.
   *
   * @param ownerId - UUID of the preset owner.
   * @returns Array of FilterPreset belonging to the owner.
   */
  listPresets(ownerId: string): FilterPreset[] {
    return Array.from(this.presets.values()).filter((p) => p.ownerId === ownerId);
  }

  /**
   * Delete a saved filter preset.
   *
   * @param name - The preset name to delete.
   * @param ownerId - UUID of the preset owner.
   * @returns `true` if the preset was found and deleted, `false` otherwise.
   */
  deletePreset(name: string, ownerId: string): boolean {
    return this.presets.delete(`${ownerId}:${name}`);
  }

  /**
   * Apply a saved filter preset and return filtered, paginated results.
   *
   * Looks up the preset by name and owner, then delegates to `filter()`.
   * If the preset is not found, returns an empty result set.
   *
   * @param presetName - Name of the saved preset to apply.
   * @param ownerId - UUID of the preset owner.
   * @param page - Page number (1-based, default: 1).
   * @param limit - Results per page (default: 10).
   * @returns Paginated results from the preset's filters, or empty if preset not found.
   */
  async filterWithPreset(presetName: string, ownerId: string, page: number = 1, limit: number = 10): Promise<{ data: HealthTask[], total: number }> {
    const preset = this.getPreset(presetName, ownerId);
    if (!preset) return { data: [], total: 0 };
    return this.filter(preset.filters, page, limit);
  }
}
