import { Injectable } from '@nestjs/common';

@Injectable()
export class CategoryService {
  async getCategoriesCount(): Promise<{ count: number }> {
    // Return the total number of active task categories
    return { count: 0 };
  }
}
