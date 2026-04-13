import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPollSortOrder1775900000000 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "polls" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0`);
        // Give existing polls stable order based on creation time
        await queryRunner.query(`
            UPDATE "polls" p
            SET "sort_order" = sub.rn - 1
            FROM (
                SELECT id, ROW_NUMBER() OVER (PARTITION BY meeting_id ORDER BY created_at ASC) AS rn
                FROM "polls"
            ) sub
            WHERE p.id = sub.id
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "polls" DROP COLUMN IF EXISTS "sort_order"`);
    }

}
