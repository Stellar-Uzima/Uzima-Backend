import { DataSource } from 'typeorm';
import { BaseSeeder } from './base.seeder';
import { HealthTask, TaskCategory } from '../../tasks/entities/health-task.entity';
import { TaskCategory as TaskCategoryEntity } from '../../tasks/entities/task-category.entity';

interface HealthTaskData {
  title: string;
  description: string;
  category: TaskCategory;
  xlmReward: number;
  status?: string;
  targetProfile?: Record<string, any>;
}

export const healthTasksData: HealthTaskData[] = [
  // Nutrition tasks
  {
    title: 'Eat 5 servings of fruits and vegetables',
    description: 'Consume at least 5 servings of fruits and vegetables today for optimal nutrition.',
    category: TaskCategory.NUTRITION,
    xlmReward: 0.5,
    status: 'active',
  },
  {
    title: 'Drink 2 liters of water',
    description: 'Stay hydrated by drinking at least 2 liters of water throughout the day.',
    category: TaskCategory.NUTRITION,
    xlmReward: 0.3,
    status: 'active',
  },
  {
    title: 'Eat a balanced breakfast',
    description: 'Start your day with a nutritious breakfast containing protein, carbs, and healthy fats.',
    category: TaskCategory.NUTRITION,
    xlmReward: 0.4,
    status: 'active',
  },
  // Fitness tasks
  {
    title: 'Walk 10,000 steps',
    description: 'Achieve your daily step goal of 10,000 steps to maintain physical fitness.',
    category: TaskCategory.FITNESS,
    xlmReward: 1.0,
    status: 'active',
  },
  {
    title: '30 minutes of yoga',
    description: 'Complete a 30-minute yoga session to improve flexibility and mindfulness.',
    category: TaskCategory.FITNESS,
    xlmReward: 1.2,
    status: 'active',
  },
  {
    title: 'Strength training workout',
    description: 'Perform a 20-minute strength training routine focusing on major muscle groups.',
    category: TaskCategory.FITNESS,
    xlmReward: 1.5,
    status: 'active',
  },
  // Mental health tasks
  {
    title: 'Meditate for 15 minutes',
    description: 'Practice mindfulness meditation for 15 minutes to reduce stress and improve focus.',
    category: TaskCategory.MENTAL,
    xlmReward: 0.8,
    status: 'active',
  },
  {
    title: 'Journal your thoughts',
    description: 'Write down your thoughts, feelings, and gratitude for the day in your journal.',
    category: TaskCategory.MENTAL,
    xlmReward: 0.4,
    status: 'active',
  },
  {
    title: 'Practice deep breathing exercises',
    description: 'Complete 3 sets of deep breathing exercises (4-7-8 technique) to calm your mind.',
    category: TaskCategory.MENTAL,
    xlmReward: 0.5,
    status: 'active',
  },
  // Sleep tasks
  {
    title: 'Get 8 hours of sleep',
    description: 'Ensure you get a full 8 hours of quality sleep tonight for optimal recovery.',
    category: TaskCategory.SLEEP,
    xlmReward: 1.0,
    status: 'active',
  },
  {
    title: 'Create a bedtime routine',
    description: 'Follow a consistent bedtime routine: no screens 30 min before bed, read, and relax.',
    category: TaskCategory.SLEEP,
    xlmReward: 0.6,
    status: 'active',
  },
  // Hydration tasks
  {
    title: 'Track your water intake',
    description: 'Log all water consumption today and ensure you meet your hydration goal.',
    category: TaskCategory.HYDRATION,
    xlmReward: 0.3,
    status: 'active',
  },
  {
    title: 'Replace sugary drinks with water',
    description: 'Choose water over sugary beverages for all drinks today.',
    category: TaskCategory.HYDRATION,
    xlmReward: 0.5,
    status: 'active',
  },
];

export class HealthTaskSeeder extends BaseSeeder {
  constructor(dataSource: DataSource) {
    super(dataSource);
  }

  getName(): string {
    return 'HealthTaskSeeder';
  }

  async exists(): Promise<boolean> {
    const healthTaskRepository = this.dataSource.getRepository(HealthTask);
    const count = await healthTaskRepository.count();
    return count > 0;
  }

  async run(): Promise<void> {
    const healthTaskRepository = this.dataSource.getRepository(HealthTask);

    for (const taskData of healthTasksData) {
      // Check if task already exists by title (idempotent)
      const existingTask = await healthTaskRepository.findOne({
        where: { title: taskData.title },
      });

      if (existingTask) {
        console.log(`⏭️  Health task already exists: ${taskData.title}`);
        continue;
      }

      // Create health task
      const task = healthTaskRepository.create({
        title: taskData.title,
        description: taskData.description,
        category: taskData.category,
        xlmReward: taskData.xlmReward,
        status: taskData.status || 'active',
        createdBy: 'system',
        isActive: true,
        targetProfile: taskData.targetProfile || null,
      });

      await healthTaskRepository.save(task);
      console.log(`✅ Created health task: ${taskData.title}`);
    }

    const count = await healthTaskRepository.count();
    console.log(`\n📊 Total health tasks in database: ${count}`);
  }
}
