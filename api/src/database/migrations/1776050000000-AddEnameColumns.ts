import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEnameColumns1776050000000 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // attendees.attendee_ename — used for ename-first dedup during check-in
        await queryRunner.query(`ALTER TABLE "attendees" ADD COLUMN IF NOT EXISTS "attendee_ename" VARCHAR`);

        // mandates.granter_ename / proxy_ename — stored at mandate creation for ename-first matching
        await queryRunner.query(`ALTER TABLE "mandates" ADD COLUMN IF NOT EXISTS "granter_ename" VARCHAR`);
        await queryRunner.query(`ALTER TABLE "mandates" ADD COLUMN IF NOT EXISTS "proxy_ename" VARCHAR`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "attendees" DROP COLUMN IF EXISTS "attendee_ename"`);
        await queryRunner.query(`ALTER TABLE "mandates" DROP COLUMN IF EXISTS "granter_ename"`);
        await queryRunner.query(`ALTER TABLE "mandates" DROP COLUMN IF EXISTS "proxy_ename"`);
    }

}
