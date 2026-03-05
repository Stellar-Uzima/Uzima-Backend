import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectRedis } from '@nestjs-modules/ioredis';
import type Redis from 'ioredis';
import { TaskCategory } from '../entities/task-category.entity';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { CategoryResponseDto } from './dto/category-response.dto';

const CACHE_KEY = 'task_categories';
const CACHE_TTL_SECONDS = 60 * 60; // 1 hour

@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);

  constructor(
    @InjectRepository(TaskCategory)
    private readonly categoryRepository: Repository<TaskCategory>,

    @InjectRedis()
    private readonly redis: Redis,
  ) {}

  /**
   * List all categories — no filters.
   * Cached in Redis under "task_categories" for 1 hour.
   * Returns [] if none exist, never throws for an empty result.
   */
  async findAll(): Promise<CategoryResponseDto[]> {
    // 1. Try cache
    try {
      const cached = await this.redis.get(CACHE_KEY);
      if (cached) {
        this.logger.debug('Returning task categories from cache');
        return JSON.parse(cached) as CategoryResponseDto[];
      }
    } catch (err) {
      this.logger.warn(`Redis read failed, falling back to DB: ${err}`);
    }

    // 2. Query DB
    const rows = await this.categoryRepository.find({
      select: ['id', 'name', 'nameTranslations', 'icon', 'color'],
      order: { name: 'ASC' },
    });

    const result: CategoryResponseDto[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      nameTranslations: r.nameTranslations,
      icon: r.icon,
      color: r.color,
    }));

    // 3. Populate cache (fire-and-forget)
    try {
      await this.redis.set(CACHE_KEY, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS);
      this.logger.debug(`Cached task categories (TTL ${CACHE_TTL_SECONDS}s)`);
    } catch (err) {
      this.logger.warn(`Redis write failed: ${err}`);
    }

    return result;
  }

  /**
   * Retrieve a single category by ID
   */
  async findOne(id: string): Promise<CategoryResponseDto> {
    const category = await this.categoryRepository.findOne({
      where: { id, isActive: true },
    });

    if (!category) {
      throw new NotFoundException(`Category with id "${id}" not found or is deactivated`);
    }

    return category as CategoryResponseDto;
  }

  /**
   * Create a new task category
   */
  async create(dto: CreateCategoryDto): Promise<CategoryResponseDto> {
    const category = this.categoryRepository.create(dto);
    const saved = await this.categoryRepository.save(category);
    this.logger.log(`Created task category: ${saved.name}`);
    await this.invalidateCache();
    return saved as CategoryResponseDto;
  }

  /**
   * Update an existing task category
   */
  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryResponseDto> {
    const category = await this.categoryRepository.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException(`Category with id "${id}" not found`);
    }
    Object.assign(category, dto);
    const updated = await this.categoryRepository.save(category);
    this.logger.log(`Updated task category: ${updated.name}`);
    await this.invalidateCache();
    return updated as CategoryResponseDto;
  }

  /**
   * Soft-delete a category
   */
  async deactivate(id: string): Promise<void> {
    const category = await this.categoryRepository.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException(`Category with id "${id}" not found`);
    }
    category.isActive = false;
    await this.categoryRepository.save(category);
    this.logger.log(`Deactivated task category: ${category.name}`);
    await this.invalidateCache();
  }

  /**
   * Invalidate the categories cache.
   * Called after any mutation so the next read reflects the latest data.
   */
  async invalidateCache(): Promise<void> {
    try {
      await this.redis.del(CACHE_KEY);
      this.logger.log('Invalidated task_categories cache');
    } catch (err) {
      this.logger.warn(`Cache invalidation failed: ${err}`);
    }
  }
}