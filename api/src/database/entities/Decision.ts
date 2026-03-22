import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn,
} from "typeorm";

export type DecisionResult = "aangenomen" | "verworpen";

export interface BreakdownEntry {
    option_id: string;
    label: string;
    count: number;
}

@Entity("decisions")
export class Decision {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column({ nullable: true })
    ontology_id!: string;

    @Column({ type: "jsonb", nullable: true })
    acl!: object;

    @Column("uuid")
    poll_id!: string;

    @Column("uuid")
    meeting_id!: string;

    @Column({ type: "text" })
    motion_text!: string;

    @Column({
        type: "enum",
        enum: ["aangenomen", "verworpen"],
    })
    result!: DecisionResult;

    // [{option_id, label, count}]
    @Column({ type: "jsonb" })
    breakdown!: BreakdownEntry[];

    @Column({ type: "int" })
    total_votes!: number;

    @Column({ type: "timestamptz" })
    closed_at!: Date;

    @Column({ nullable: true })
    facilitator_signature!: string;

    @CreateDateColumn()
    created_at!: Date;
}
