import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskCategory } from '../entities/task-category.entity';
import { CreateCategoryDto, UpdateCategoryDto, CategoryResponseDto } from './dto/category.dto';

@Injectable()
export class CategoryService {
    private readonly logger = new Logger(CategoryService.name);

    constructor(
        @InjectRepository(TaskCategory)
        private readonly categoryRepository: Repository<TaskCategory>,
    ) { }

    /**
     * Retrieve all active task categories
     */
    async findAll(): Promise<CategoryResponseDto[]> {
        const categories = await this.categoryRepository.find({
            where: { isActive: true },
            order: { name: 'ASC' },
        });
        return categories as CategoryResponseDto[];
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
        return updated as CategoryResponseDto;
    }

    async deactivate(id: string): Promise<void> {
        const category = await this.categoryRepository.findOne({ where: { id } });
        if (!category) {
            throw new NotFoundException(`Category with id "${id}" not found`);
        }
        category.isActive = false;
        await this.categoryRepository.save(category);
        this.logger.log(`Deactivated task category: ${category.name}`);
    }
}