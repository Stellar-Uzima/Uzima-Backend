import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class CreateTaskCategories1771889592955 implements MigrationInterface {
    name = 'CreateTaskCategories1771889592955'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(new Table({
            name: "task_categories",
            columns: [
                {
                    name: "id",
                    type: "uuid",
                    isPrimary: true,
                    isNullable: false,
                    default: "uuid_generate_v4()",
                },
                {
                    name: "name",
                    type: "varchar",
                    isNullable: false,
                },
                {
                    name: "nameTranslations",
                    type: "jsonb",
                    isNullable: false,
                },
                {
                    name: "icon",
                    type: "varchar",
                    isNullable: true,
                },
                {
                    name: "color",
                    type: "varchar",
                    isNullable: true,
                },
                {
                    name: "isActive",
                    type: "boolean",
                    isNullable: false,
                    default: true,
                },
                {
                    name: "createdAt",
                    type: "timestamp",
                    isNullable: false,
                    default: "now()",
                },
                {
                    name: "updatedAt",
                    type: "timestamp",
                    isNullable: false,
                    default: "now()",
                },
            ],
        }), true);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable("task_categories");
    }
}