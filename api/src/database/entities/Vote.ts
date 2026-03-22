import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, ManyToOne, JoinColumn,
} from "typeorm";
import { Poll } from "./Poll";

export type VoteMethod = "app" | "manual" | "mandate";

@Entity("votes")
export class Vote {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column({ nullable: true })
    ontology_id!: string;

    @Column({ type: "jsonb", nullable: true })
    acl!: object;

    @ManyToOne(() => Poll, (p) => p.votes, { onDelete: "CASCADE" })
    @JoinColumn({ name: "poll_id" })
    poll!: Poll;

    @Column("uuid")
    poll_id!: string;

    @Column("uuid")
    meeting_id!: string;

    @Column()
    voter_name!: string;

    @Column({ nullable: true })
    voter_ename!: string;

    // References Poll.vote_options[].id
    @Column()
    option_id!: string;

    @Column({ type: "timestamptz" })
    cast_at!: Date;

    @Column({
        type: "enum",
        enum: ["app", "manual", "mandate"],
        default: "app",
    })
    method!: VoteMethod;

    // For mandate votes: who the voter is acting on behalf of
    @Column({ nullable: true })
    on_behalf_of_name!: string;

    @Column({ nullable: true })
    on_behalf_of_ename!: string;

    @Column({ nullable: true })
    signature!: string;

    @CreateDateColumn()
    created_at!: Date;
}
