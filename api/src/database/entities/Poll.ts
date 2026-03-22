import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany,
} from "typeorm";
import { Meeting } from "./Meeting";
import { Vote } from "./Vote";

export type PollStatus = "prepared" | "active" | "closed";

export interface VoteOption {
    id: string;
    label: string;
}

@Entity("polls")
export class Poll {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column({ nullable: true })
    ontology_id!: string;

    @Column({ type: "jsonb", nullable: true })
    acl!: object;

    @ManyToOne(() => Meeting, (m) => m.polls, { onDelete: "CASCADE" })
    @JoinColumn({ name: "meeting_id" })
    meeting!: Meeting;

    @Column("uuid")
    meeting_id!: string;

    @Column({ type: "text" })
    motion_text!: string;

    // [{id: "voor", label: "Voor"}, ...]
    @Column({ type: "jsonb" })
    vote_options!: VoteOption[];

    @Column({
        type: "enum",
        enum: ["prepared", "active", "closed"],
        default: "prepared",
    })
    status!: PollStatus;

    @Column({ type: "timestamptz", nullable: true })
    opened_at!: Date | null;

    @Column({ type: "timestamptz", nullable: true })
    closed_at!: Date | null;

    @Column({ nullable: true })
    facilitator_ename!: string;

    @OneToMany(() => Vote, (v) => v.poll)
    votes!: Vote[];

    @CreateDateColumn()
    created_at!: Date;

    @UpdateDateColumn()
    updated_at!: Date;
}
