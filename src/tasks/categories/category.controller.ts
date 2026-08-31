import { Controller, Get } from '@nestj/common';
import { ApiOperation } from '@nestjs/swagger';
import { CategoryService } from './category.service';

@Controller('tasks/categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get('count')
  @ApiOperation({ summary: 'Get count of categories' })
  async getCategoriesCount(): Promise<{ count: number }> {
    return this.categoryService.getCategoriesCount();
  }
}
