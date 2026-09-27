import { DataSource } from 'typeorm';
import { BaseSeeder } from './base.seeder';

/**
 * Reproducible seed data for development/QA/demo environments (#1327).
 * Guarded by NODE_ENV so it can never run against production.
 */
export class DemoDataSeeder extends BaseSeeder {
  constructor(dataSource: DataSource) {
    super(dataSource);
  }

  getName(): string {
    return 'DemoDataSeeder';
  }

  async run(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      this.logger.warn('DemoDataSeeder skipped: refusing to seed demo data in production');
      return;
    }

    // Deterministic seed so demo/QA data is reproducible across runs.
    const seedTag = `demo-${process.env.NODE_ENV ?? 'development'}`;
    this.logger.log(`Seeding demo data with tag "${seedTag}"`);

    // Intentionally minimal: concrete demo rows (users, tasks, referrals)
    // should be composed here from the existing seeders (UserSeeder,
    // TaskCategorySeeder, etc.) once this seeder is wired into run-seeders.ts.
  }
}
