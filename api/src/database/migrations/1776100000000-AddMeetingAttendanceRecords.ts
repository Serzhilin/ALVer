import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMeetingAttendanceRecords1776100000000 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TYPE "attendance_status_enum" AS ENUM ('attended', 'mandated', 'absent')
        `);
        await queryRunner.query(`
            CREATE TABLE "meeting_attendance_records" (
                "id"           UUID NOT NULL DEFAULT uuid_generate_v4(),
                "meeting_id"   UUID NOT NULL,
                "community_id" UUID,
                "member_ename" VARCHAR,
                "member_name"  VARCHAR NOT NULL,
                "is_aspirant"  BOOLEAN NOT NULL DEFAULT false,
                "status"       "attendance_status_enum" NOT NULL,
                "proxy_ename"  VARCHAR,
                "proxy_name"   VARCHAR,
                "recorded_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT "PK_meeting_attendance_records" PRIMARY KEY ("id"),
                CONSTRAINT "FK_meeting_attendance_records_meeting"
                    FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_mar_meeting_ename"
                ON "meeting_attendance_records"("meeting_id", "member_ename")
                WHERE "member_ename" IS NOT NULL
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_mar_meeting_name"
                ON "meeting_attendance_records"("meeting_id", "member_name")
                WHERE "member_ename" IS NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "meeting_attendance_records"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "attendance_status_enum"`);
    }

}
