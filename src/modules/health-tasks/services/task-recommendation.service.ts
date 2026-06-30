import { Injectable } from '@nestjs/common';
import { TaskCategory } from '../../../tasks/entities/health-task.entity';
import { AnalyticsService } from './analytics.service';
import { TaskTemplatesService } from './templates.service';

export interface RecommendedTask {
  id: string;
  title: string;
  description?: string;
  category: TaskCategory;
  xlmReward?: number;
  matchScore: number;
  reason: string;
}

@Injectable()
export class TaskRecommendationService {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly templatesService: TaskTemplatesService,
  ) {}

  async getRecommendations(userId: string, limit: number = 5): Promise<RecommendedTask[]> {
    const userStats = await this.analyticsService.getUserTaskStats(userId);
    const categoryEngagement = await this.getCategoryEngagement(userId);

    const availableTemplates = this.templatesService.getAllTemplates?.() || [];

    if (Object.keys(categoryEngagement).length === 0 || userStats.totalCompletions === 0) {
      return this.getDefaultRecommendations(limit);
    }

    const scored = availableTemplates.map((template: any) => {
      const score = this.calculateMatchScore(template, categoryEngagement);
      return {
        id: template.id,
        title: template.fields.title,
        description: template.fields.description,
        category: template.fields.category,
        xlmReward: template.fields.xlmReward,
        matchScore: score,
        reason: this.generateReason(template.fields.category, score),
      };
    });

    return scored
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, limit);
  }

  private async getCategoryEngagement(userId: string): Promise<Record<TaskCategory, number>> {
    // Extend analytics in future for real data
    return {};
  }

  private calculateMatchScore(template: any, engagement: Record<TaskCategory, number>): number {
    const base = engagement[template.fields.category] || 0;
    return Math.min(1, base * 0.8 + (template.fields.xlmReward ? 0.15 : 0));
  }

  private generateReason(category: TaskCategory, score: number): string {
    if (score > 0.75) return `High engagement in ${category}`;
    return `Recommended ${category} task`;
  }

  private getDefaultRecommendations(limit: number): RecommendedTask[] {
    const defaults: RecommendedTask[] = [
      { id: 'def-1', title: 'Daily Hydration', description: 'Log water intake', category: TaskCategory.WELLNESS, xlmReward: 5, matchScore: 0.9, reason: 'Core wellness habit' },
      { id: 'def-2', title: 'Morning Movement', description: 'Light stretch or walk', category: TaskCategory.PHYSICAL, xlmReward: 7, matchScore: 0.85, reason: 'Build healthy routine' },
      { id: 'def-3', title: 'Mindful Moment', description: '5 min breathing', category: TaskCategory.MINDFULNESS, xlmReward: 6, matchScore: 0.8, reason: 'Mental health foundation' },
    ];
    return defaults.slice(0, limit);
  }
}
