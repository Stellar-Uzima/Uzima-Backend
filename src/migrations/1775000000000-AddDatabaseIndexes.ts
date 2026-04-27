import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddDatabaseIndexes1775000000000 implements MigrationInterface {
    name = 'AddDatabaseIndexes1775000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Indexes for task_activity table
        await queryRunner.createIndex(
            'task_activity',
            new TableIndex({
                name: 'IDX_task_activity_taskId',
                columnNames: ['taskId']
            })
        );
        
        await queryRunner.createIndex(
            'task_activity',
            new TableIndex({
                name: 'IDX_task_activity_changedBy_createdAt',
                columnNames: ['changedBy', 'createdAt']
            })
        );
        
        await queryRunner.createIndex(
            'task_activity',
            new TableIndex({
                name: 'IDX_task_activity_createdAt',
                columnNames: ['createdAt']
            })
        );

        // Indexes for task_reminders table
        await queryRunner.createIndex(
            'task_reminders',
            new TableIndex({
                name: 'IDX_task_reminders_userId_remindAt',
                columnNames: ['userId', 'remindAt']
            })
        );
        
        await queryRunner.createIndex(
            'task_reminders',
            new TableIndex({
                name: 'IDX_task_reminders_status',
                columnNames: ['status']
            })
        );
        
        await queryRunner.createIndex(
            'task_reminders',
            new TableIndex({
                name: 'IDX_task_reminders_createdAt',
                columnNames: ['createdAt']
            })
        );

        // Indexes for health_tasks table
        await queryRunner.createIndex(
            'health_tasks',
            new TableIndex({
                name: 'IDX_health_tasks_status',
                columnNames: ['status']
            })
        );
        
        await queryRunner.createIndex(
            'health_tasks',
            new TableIndex({
                name: 'IDX_health_tasks_createdAt',
                columnNames: ['createdAt']
            })
        );

        // Indexes for daily_task_assignments table
        await queryRunner.createIndex(
            'daily_task_assignments',
            new TableIndex({
                name: 'IDX_daily_task_assignments_user_assignedDate',
                columnNames: ['userId', 'assignedDate']
            })
        );
        
        await queryRunner.createIndex(
            'daily_task_assignments',
            new TableIndex({
                name: 'IDX_daily_task_assignments_createdAt',
                columnNames: ['createdAt']
            })
        );

        // Email index for users table (if not already exists)
        const emailIndexExists = await queryRunner.query(`
            SELECT COUNT(*) as count 
            FROM pg_indexes 
            WHERE tablename = 'users' AND indexname LIKE '%email%'
        `);
        
        if (parseInt(emailIndexExists[0].count) === 0) {
            await queryRunner.createIndex(
                'users',
                new TableIndex({
                    name: 'IDX_users_email',
                    columnNames: ['email'],
                    isUnique: true
                })
            );
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop indexes for task_activity table
        await queryRunner.dropIndex('task_activity', 'IDX_task_activity_taskId');
        await queryRunner.dropIndex('task_activity', 'IDX_task_activity_changedBy_createdAt');
        await queryRunner.dropIndex('task_activity', 'IDX_task_activity_createdAt');

        // Drop indexes for task_reminders table
        await queryRunner.dropIndex('task_reminders', 'IDX_task_reminders_userId_remindAt');
        await queryRunner.dropIndex('task_reminders', 'IDX_task_reminders_status');
        await queryRunner.dropIndex('task_reminders', 'IDX_task_reminders_createdAt');

        // Drop indexes for health_tasks table
        await queryRunner.dropIndex('health_tasks', 'IDX_health_tasks_status');
        await queryRunner.dropIndex('health_tasks', 'IDX_health_tasks_createdAt');

        // Drop indexes for daily_task_assignments table
        await queryRunner.dropIndex('daily_task_assignments', 'IDX_daily_task_assignments_user_assignedDate');
        await queryRunner.dropIndex('daily_task_assignments', 'IDX_daily_task_assignments_createdAt');

        // Drop email index for users table
        await queryRunner.dropIndex('users', 'IDX_users_email');
    }
}
