import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMeetingEndTime1775800000000 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "end_time" VARCHAR(5)`);
        // Prefill past meetings with 13:00
        await queryRunner.query(`UPDATE "meetings" SET "end_time" = '13:00' WHERE "end_time" IS NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "meetings" DROP COLUMN IF EXISTS "end_time"`);
    }

}
