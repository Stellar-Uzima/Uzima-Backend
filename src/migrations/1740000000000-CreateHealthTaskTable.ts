import { MigrationInterface, QueryRunner, Table, TableForeignKey } from "typeorm";

export class CreateHealthTaskTable1740000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create health_tasks table first to satisfy later foreign key constraints
        await queryRunner.createTable(new Table({
            name: "health_tasks",
            columns: [
                {
                    name: "id",
                    type: "uuid",
                    isPrimary: true,
                    generationStrategy: "uuid",
                    default: "gen_random_uuid()"
                },
                {
                    name: "title",
                    type: "varchar"
                },
                {
                    name: "description",
                    type: "text",
                    isNullable: true
                },
                {
                    name: "category",
                    type: "varchar"
                },
                {
                    name: "createdBy",
                    type: "uuid",
                    isNullable: true
                },
                {
                    name: "status",
                    type: "varchar",
                    default: "'draft'"
                },
                {
                    name: "xlmReward",
                    type: "decimal",
                    precision: 10,
                    scale: 2,
                    default: 0
                },
                {
                    name: "targetProfile",
                    type: "jsonb",
                    isNullable: true
                },
                {
                    name: "isActive",
                    type: "boolean",
                    default: true
                },
                {
                    name: "createdAt",
                    type: "timestamp",
                    default: "now()"
                },
                {
                    name: "updatedAt",
                    type: "timestamp",
                    default: "now()"
                }
            ]
        }), true);

        // Add foreign key for createdBy if users table exists
        const hasUsers = await queryRunner.hasTable("users");
        if (hasUsers) {
            await queryRunner.createForeignKey("health_tasks", new TableForeignKey({
                columnNames: ["createdBy"],
                referencedColumnNames: ["id"],
                referencedTableName: "users",
                onDelete: "CASCADE"
            }));
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable("health_tasks");
    }
}
