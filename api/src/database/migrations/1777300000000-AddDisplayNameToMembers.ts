import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDisplayNameToMembers1777300000000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS display_name VARCHAR`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE members DROP COLUMN IF EXISTS display_name`);
    }
}
