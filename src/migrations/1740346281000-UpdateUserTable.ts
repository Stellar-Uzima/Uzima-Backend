import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class UpdateUserTable1740346281000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumns('users', [
            new TableColumn({
                name: 'last_active_at',
                type: 'timestamp',
                isNullable: true,
            }),
            new TableColumn({
                name: 'email_verification_token',
                type: 'varchar',
                isNullable: true,
            }),
            new TableColumn({
                name: 'email_verification_expiry',
                type: 'timestamp',
                isNullable: true,
            }),
            new TableColumn({
                name: 'password_reset_token',
                type: 'varchar',
                isNullable: true,
            }),
            new TableColumn({
                name: 'password_reset_expiry',
                type: 'timestamp',
                isNullable: true,
            }),
        ]);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn('users', 'last_active_at');
        await queryRunner.dropColumn('users', 'email_verification_token');
        await queryRunner.dropColumn('users', 'email_verification_expiry');
        await queryRunner.dropColumn('users', 'password_reset_token');
        await queryRunner.dropColumn('users', 'password_reset_expiry');
    }
}
