import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
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
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { CategoryResponseDto } from './dto/category-response.dto';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Role } from '../../auth/enums/role.enum';
import { Roles } from '../../auth/decorators/roles.decorator';

@ApiTags('Task Categories')
@Controller('tasks/categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  /**
   * GET /tasks/categories
   * Public — no authentication required.
   * Returns [] when no categories exist.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List task categories',
    description:
      'Public endpoint. Returns task categories for filter dropdowns. ' +
      'Cached in Redis for 1 hour when no search or pagination is provided. Returns [] if no matches.',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Optional case-insensitive partial search against category name',
    example: 'nutrition',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Optional page number for pagination (1-indexed)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Optional page size for pagination',
    example: 20,
  })
  @ApiResponse({
    status: 200,
    description: 'Array of task categories (may be empty)',
    type: [CategoryResponseDto],
  })
  findAll(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<CategoryResponseDto[]> {
    const parsedPage = page ? Number(page) : 1;
    const parsedLimit = limit ? Number(limit) : 0;

    const resolvedPage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const resolvedLimit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 0;
    return this.categoryService.findAll(search, resolvedPage, resolvedLimit);
  }

  /**
   * GET /tasks/categories/:id — public
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a task category by ID (public)' })
  @ApiResponse({ status: 200, type: CategoryResponseDto })
  @ApiResponse({ status: 404, description: 'Category not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CategoryResponseDto> {
    return this.categoryService.findOne(id);
  }

  /**
   * POST /tasks/categories — admin only
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
    return this.categoryService.deactivate(id);
  }
}
