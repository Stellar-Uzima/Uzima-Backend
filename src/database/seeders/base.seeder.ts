import { DataSource } from 'typeorm';

import { Logger } from '@nestjs/common';

/**
 * Abstract base class for all seeders.
 * Provides common functionality and enforces a consistent interface.
 */
export abstract class BaseSeeder {
  protected readonly logger = new Logger(this.constructor.name);
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
   * Execute the seeder with structured logging instead of raw console statements.
   */
  async seed(): Promise<void> {
    const name = this.getName();
    this.logger.log(`Starting seeder: ${name}`);

    try {
      const alreadyExists = await this.exists();
      if (alreadyExists) {
        this.logger.log(`Seeder ${name} - Data already exists, skipping (idempotent)`);
        return;
      }

      await this.run();
      this.logger.log(`Seeder ${name} - Completed successfully`);
    } catch (error) {
      this.logger.error(
        `Seeder ${name} - Failed`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}
