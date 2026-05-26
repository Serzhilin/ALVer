import { MigrationInterface, QueryRunner } from "typeorm";

export class DropUsersTable1777200000000 implements MigrationInterface {
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    }

    async down(_queryRunner: QueryRunner): Promise<void> {
        // Intentionally no-op — users table replaced by members
    }
}
