import { MigrationInterface, QueryRunner } from "typeorm";

export class MemberIdentityConsolidation1777100000000 implements MigrationInterface {
    name = "MemberIdentityConsolidation1777100000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Add new name columns to members
        await queryRunner.query(`ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "app_first_name" character varying`);
        await queryRunner.query(`ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "app_last_name" character varying`);
        await queryRunner.query(`ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "avatar_url" character varying`);

        // 2. Copy existing first_name/last_name → app names (preserve paperwork data)
        await queryRunner.query(`UPDATE "members" SET "app_first_name" = "first_name" WHERE "app_first_name" IS NULL`);
        await queryRunner.query(`UPDATE "members" SET "app_last_name" = "last_name" WHERE "app_last_name" IS NULL`);

        // 3. Partial unique index: one ename per community (nulls excluded)
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_members_community_ename"
            ON "members" ("community_id", "ename")
            WHERE "ename" IS NOT NULL
        `);

        // 4. Add voter_member_id to votes (nullable — for dedup of ename-less voters)
        await queryRunner.query(`ALTER TABLE "votes" ADD COLUMN IF NOT EXISTS "voter_member_id" uuid`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_members_community_ename"`);
        await queryRunner.query(`ALTER TABLE "members" DROP COLUMN IF EXISTS "app_first_name"`);
        await queryRunner.query(`ALTER TABLE "members" DROP COLUMN IF EXISTS "app_last_name"`);
        await queryRunner.query(`ALTER TABLE "members" DROP COLUMN IF EXISTS "avatar_url"`);
        await queryRunner.query(`ALTER TABLE "votes" DROP COLUMN IF EXISTS "voter_member_id"`);
    }
}
