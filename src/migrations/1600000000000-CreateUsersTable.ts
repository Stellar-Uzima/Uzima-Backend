import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersTable1600000000000 implements MigrationInterface {
  name = 'CreateUsersTable1600000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Use gen_random_uuid() (built-in in PostgreSQL 13+) to avoid needing uuid-ossp extension
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" varchar(100) UNIQUE,
        "phoneNumber" varchar(20) UNIQUE,
        "firstName" varchar(100) NOT NULL,
        "lastName" varchar(100) NOT NULL,
        "password" varchar(255),
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('users');
  }
}
