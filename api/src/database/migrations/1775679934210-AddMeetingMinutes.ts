import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMeetingMinutes1775679934210 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add minutes_status enum type if it doesn't exist
        await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "public"."meetings_minutes_status_enum" AS ENUM('draft', 'published');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `);
        await queryRunner.query(`ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "minutes_html" TEXT`);
        await queryRunner.query(`ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "minutes_status" "public"."meetings_minutes_status_enum" DEFAULT NULL`);
        await queryRunner.query(`ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "notulist_ename" VARCHAR`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "meetings" DROP COLUMN IF EXISTS "notulist_ename"`);
        await queryRunner.query(`ALTER TABLE "meetings" DROP COLUMN IF EXISTS "minutes_status"`);
        await queryRunner.query(`ALTER TABLE "meetings" DROP COLUMN IF EXISTS "minutes_html"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."meetings_minutes_status_enum"`);
    }

}
