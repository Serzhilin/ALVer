import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase3VotingInterop1777400000000 implements MigrationInterface {
    name = 'Phase3VotingInterop1777400000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "polls" ADD "option_labels" text[] NULL`);
        await queryRunner.query(`ALTER TABLE "polls" ADD "created_by_meta_envelope_id" varchar NULL`);
        await queryRunner.query(`ALTER TABLE "votes" ADD "vote_data" jsonb NULL`);
        await queryRunner.query(`ALTER TABLE "votes" ADD "voter_meta_envelope_id" varchar NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "votes" DROP COLUMN "voter_meta_envelope_id"`);
        await queryRunner.query(`ALTER TABLE "votes" DROP COLUMN "vote_data"`);
        await queryRunner.query(`ALTER TABLE "polls" DROP COLUMN "created_by_meta_envelope_id"`);
        await queryRunner.query(`ALTER TABLE "polls" DROP COLUMN "option_labels"`);
    }
}
