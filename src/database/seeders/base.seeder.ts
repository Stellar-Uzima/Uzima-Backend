import { DataSource } from 'typeorm';

/**
 * Abstract base class for all seeders.
 * Provides common functionality and enforces a consistent interface.
 */
export abstract class BaseSeeder {
  protected dataSource: DataSource;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
  }

  /**
   * Run the seeding operation.
   * Must be implemented by concrete seeders.
   */
  abstract run(): Promise<void>;

  /**
   * Check if data already exists (for idempotent seeding).
   * Override this method in concrete seeders.
   */
  async exists(): Promise<boolean> {
    return false;
  }

  /**
   * Get the name of the seeder for logging purposes.
   */
  abstract getName(): string;

  /**
   * Execute the seeder with logging.
   */
  async seed(): Promise<void> {
    const name = this.getName();
    console.log(`\n🌱 Starting seeder: ${name}`);

    try {
      const alreadyExists = await this.exists();
      if (alreadyExists) {
        console.log(`⏭️  Seeder ${name} - Data already exists, skipping (idempotent)`);
        return;
      }

      await this.run();
      console.log(`✅ Seeder ${name} - Completed successfully`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Seeder ${name} - Failed:`, errorMessage);
      throw error;
    }
  }
}
