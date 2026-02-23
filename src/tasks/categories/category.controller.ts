import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Body,
    ParseUUIDPipe,
    HttpCode,
    HttpStatus,
    UseGuards,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
} from '@nestjs/swagger';
import { CategoryService } from './category.service';
import {
    CreateCategoryDto,
    UpdateCategoryDto,
    CategoryResponseDto,
} from './dto/category.dto';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Role } from '../../auth/enums/role.enum';
import { Roles } from '../../auth/decorators/roles.decorator';

// JwtAuthGuard should be imported from your auth module, e.g.:
// import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
// It is referenced here as a placeholder comment — apply to admin-only routes.

@ApiTags('Task Categories')
@Controller('tasks/categories')
export class CategoryController {
    constructor(private readonly categoryService: CategoryService) { }

    /**
     * GET /tasks/categories — public, no auth required
     */
    @Get()
    @ApiOperation({ summary: 'List all active task categories (public)' })
    @ApiResponse({ status: 200, type: [CategoryResponseDto] })
    findAll(): Promise<CategoryResponseDto[]> {
        return this.categoryService.findAll();
    }

    /**
     * GET /tasks/categories/:id — public
     */
    @Get(':id')
    @ApiOperation({ summary: 'Get a task category by ID (public)' })
    @ApiResponse({ status: 200, type: CategoryResponseDto })
    @ApiResponse({ status: 404, description: 'Category not found' })
    findOne(@Param('id', ParseUUIDPipe) id: string): Promise<CategoryResponseDto> {
        return this.categoryService.findOne(id);
    }

    /**
     * POST /tasks/categories — admin only (add JwtAuthGuard + RolesGuard as needed)
     */
    @Post()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create a new task category (admin)' })
    @ApiResponse({ status: 201, type: CategoryResponseDto })
    create(@Body() dto: CreateCategoryDto): Promise<CategoryResponseDto> {
        return this.categoryService.create(dto);
    }

    /**
     * PUT /tasks/categories/:id — admin only
     */
    @Put(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update a task category (admin)' })
    @ApiResponse({ status: 200, type: CategoryResponseDto })
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateCategoryDto,
    ): Promise<CategoryResponseDto> {
        return this.categoryService.update(id, dto);
    }

    /**
     * DELETE /tasks/categories/:id — soft delete, admin only
     */
    @Delete(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiBearerAuth()
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Deactivate a task category (admin)' })
    @ApiResponse({ status: 204 })
    remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
        return this.categoryService.remove(id);
    }
}