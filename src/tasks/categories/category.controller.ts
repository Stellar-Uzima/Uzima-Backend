import { Controller, Get } from '@nestjs/common';
import { CategoryService } from './category.service';

@Controller('tasks/categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get('count')
  async getCategoriesCount(): Promise<{ count: number }> {
    return this.categoryService.getCategoriesCount();
  }
}
