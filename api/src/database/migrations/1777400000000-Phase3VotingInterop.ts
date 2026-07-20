import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase3VotingInterop1777400000000 implements MigrationInterface {
    name = 'Phase3VotingInterop1777400000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "polls" ADD IF NOT EXISTS "option_labels" text[] NULL`);
        await queryRunner.query(`ALTER TABLE "polls" ADD IF NOT EXISTS "created_by_meta_envelope_id" varchar NULL`);
        await queryRunner.query(`ALTER TABLE "votes" ADD IF NOT EXISTS "vote_data" jsonb NULL`);
        await queryRunner.query(`ALTER TABLE "votes" ADD IF NOT EXISTS "voter_meta_envelope_id" varchar NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "votes" DROP COLUMN "voter_meta_envelope_id"`);
        await queryRunner.query(`ALTER TABLE "votes" DROP COLUMN "vote_data"`);
        await queryRunner.query(`ALTER TABLE "polls" DROP COLUMN "created_by_meta_envelope_id"`);
        await queryRunner.query(`ALTER TABLE "polls" DROP COLUMN "option_labels"`);
    }
}
