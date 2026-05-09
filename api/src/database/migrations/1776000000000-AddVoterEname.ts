import { MigrationInterface, QueryRunner } from "typeorm";

export class AddVoterEname1776000000000 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "votes" ADD COLUMN IF NOT EXISTS "voter_ename" VARCHAR`);
        await queryRunner.query(`ALTER TABLE "votes" ADD COLUMN IF NOT EXISTS "on_behalf_of_ename" VARCHAR`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "votes" DROP COLUMN IF EXISTS "voter_ename"`);
        await queryRunner.query(`ALTER TABLE "votes" DROP COLUMN IF EXISTS "on_behalf_of_ename"`);
    }

}
