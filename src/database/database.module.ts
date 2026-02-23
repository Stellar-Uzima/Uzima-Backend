import { Module, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { typeOrmConfig } from './typeorm.config';


@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: typeOrmConfig,
    }),
  ],
})
export class DatabaseModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseModule.name);

  async onApplicationBootstrap() {
    try {
      // Attempt to get the TypeORM connection (DataSource)
      // This will throw if connection fails
      const { DataSource } = await import('typeorm');
      const dataSource = DataSource instanceof Function ? DataSource() : DataSource;
      if (!dataSource.isInitialized) {
        await dataSource.initialize();
      }
      this.logger.log('Database connection established successfully.');
    } catch (error) {
      this.logger.error('Failed to connect to the database. Please check your PostgreSQL credentials and connection settings.');
      process.exit(1);
    }
  }
}
