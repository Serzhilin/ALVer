import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from "typeorm";
import { Meeting } from "./Meeting";

export type MandateStatus = "active" | "revoked";

@Entity("mandates")
export class Mandate {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column({ nullable: true })
    ontology_id!: string;

    @Column({ type: "jsonb", nullable: true })
    acl!: object;

    @ManyToOne(() => Meeting, (m) => m.mandates, { onDelete: "CASCADE" })
    @JoinColumn({ name: "meeting_id" })
    meeting!: Meeting;

    @Column("uuid")
    meeting_id!: string;

    @Column()
    granter_name!: string;

    @Column({ nullable: true })
    granter_ename!: string;

    @Column()
    proxy_name!: string;

    @Column({ nullable: true })
    proxy_ename!: string;

    @Column({ nullable: true })
    scope_note!: string;

    @Column({ nullable: true })
    signature!: string;

    @Column({
        type: "enum",
        enum: ["active", "revoked"],
        default: "active",
    })
    status!: MandateStatus;

    @Column({ type: "timestamptz", nullable: true })
    granted_at!: Date | null;

    @Column({ type: "timestamptz", nullable: true })
    revoked_at!: Date | null;

    @CreateDateColumn()
    created_at!: Date;

    @UpdateDateColumn()
    updated_at!: Date;
}
