// src/common/test/test-utils.ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from 'src/app.module';
import { DataSource } from 'typeorm';

/**
 * Helper to create a test NestJS app with in-memory or test database.
 *
 * Usage example:
 *
 * const app = await createTestApp();
 * const response = await request(app.getHttpServer())
 *   .get('/health')
 *   .expect(200);
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule], // replace with the modules you want to test
  }).compile();

  const app = moduleRef.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );

  await app.init();

  return app;
}

/**
 * Clears all tables in the test database.
 */
export async function clearDatabase(dataSource: DataSource) {
  const entities = dataSource.entityMetadatas;
  for (const entity of entities) {
    const repo = dataSource.getRepository(entity.name);
    await repo.clear();
  }
}
