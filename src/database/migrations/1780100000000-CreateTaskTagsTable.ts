import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateTaskTagsTable1780100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create task_tags table
    await queryRunner.createTable(
      new Table({
        name: 'task_tags',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '50',
          },
          {
            name: 'color',
            type: 'varchar',
            length: '7',
            isNullable: true,
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: true,
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
          {
            name: 'deletedAt',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Create index on userId
    await queryRunner.createIndex(
      'task_tags',
      new TableIndex({
        name: 'IDX_task_tags_userId',
        columnNames: ['userId'],
      }),
    );

    // Create foreign key for userId
    await queryRunner.createForeignKey(
      'task_tags',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    // Create junction table health_task_tags
    await queryRunner.createTable(
      new Table({
        name: 'health_task_tags',
        columns: [
          {
            name: 'healthTaskId',
            type: 'uuid',
            isPrimary: true,
          },
          {
            name: 'tagId',
            type: 'uuid',
            isPrimary: true,
          },
        ],
      }),
      true,
    );

    // Create foreign key for healthTaskId
    await queryRunner.createForeignKey(
      'health_task_tags',
      new TableForeignKey({
        columnNames: ['healthTaskId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'health_tasks',
        onDelete: 'CASCADE',
      }),
    );

    // Create foreign key for tagId
    await queryRunner.createForeignKey(
      'health_task_tags',
      new TableForeignKey({
        columnNames: ['tagId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'task_tags',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('health_task_tags');
    await queryRunner.dropTable('task_tags');
  }
}
