import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
} from 'typeorm';

export class CreateHealthTasksTable1771814400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('health_tasks');
    if (tableExists) {
      return; // health_tasks already created by CreateHealthTasksAndCategories1740000000000
    }
    await queryRunner.createTable(
      new Table({
        name: 'health_tasks',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'title',
            type: 'varchar',
          },
          {
            name: 'titleTranslations',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'description',
            type: 'text',
          },
          {
            name: 'descriptionTranslations',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'categoryId',
            type: 'uuid',
            isNullable: true, // assuming optional for now
          },
          {
            name: 'xlmReward',
            type: 'decimal',
            precision: 10,
            scale: 2,
          },
          {
            name: 'proofType',
            type: 'enum',
            enum: ['photo', 'video', 'text', 'location'],
          },
          {
            name: 'difficulty',
            type: 'enum',
            enum: ['easy', 'medium', 'hard'],
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['draft', 'published', 'archived'],
            default: "'draft'",
          },
          {
            name: 'authorId',
            type: 'uuid',
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
    );

    // Add foreign keys
    await queryRunner.createForeignKey(
      'health_tasks',
      new TableForeignKey({
        columnNames: ['categoryId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'task_categories',
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.createForeignKey(
      'health_tasks',
      new TableForeignKey({
        columnNames: ['authorId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys first
    const table = await queryRunner.getTable('health_tasks');
    if (!table) {
      return;
    }
    const categoryForeignKey = table.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('categoryId') !== -1,
    );
    const authorForeignKey = table.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('authorId') !== -1,
    );
    if (categoryForeignKey) {
      await queryRunner.dropForeignKey('health_tasks', categoryForeignKey);
    }
    if (authorForeignKey) {
      await queryRunner.dropForeignKey('health_tasks', authorForeignKey);
    }

    await queryRunner.dropTable('health_tasks');
  }
}
