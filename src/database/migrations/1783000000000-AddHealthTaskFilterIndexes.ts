import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddHealthTaskFilterIndexes1783000000000 implements MigrationInterface {
    name = 'AddHealthTaskFilterIndexes1783000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Index for filtering by category
        await queryRunner.createIndex(
            'health_tasks',
            new TableIndex({
                name: 'IDX_health_tasks_category',
                columnNames: ['category'],
            }),
        );

        // Index for filtering by creator
        await queryRunner.createIndex(
            'health_tasks',
            new TableIndex({
                name: 'IDX_health_tasks_createdBy',
                columnNames: ['createdBy'],
            }),
        );

        // Index for filtering by active status
        await queryRunner.createIndex(
            'health_tasks',
            new TableIndex({
                name: 'IDX_health_tasks_isActive',
                columnNames: ['isActive'],
            }),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropIndex('health_tasks', 'IDX_health_tasks_category');
        await queryRunner.dropIndex('health_tasks', 'IDX_health_tasks_createdBy');
        await queryRunner.dropIndex('health_tasks', 'IDX_health_tasks_isActive');
    }
}
