import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from "typeorm";
import { Meeting } from "./Meeting";

export type AttendeeStatus = "expected" | "checked_in" | "absent";
export type AttendeeMethod = "app" | "manual";

@Entity("attendees")
export class Attendee {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column({ nullable: true })
    ontology_id!: string;

    @Column({ type: "jsonb", nullable: true })
    acl!: object;

    @ManyToOne(() => Meeting, (m) => m.attendees, { onDelete: "CASCADE" })
    @JoinColumn({ name: "meeting_id" })
    meeting!: Meeting;

    @Column("uuid")
    meeting_id!: string;

    @Column()
    attendee_name!: string;

    @Column({ nullable: true })
    attendee_ename!: string;

    @Column({
        type: "enum",
        enum: ["expected", "checked_in", "absent"],
        default: "expected",
    })
    status!: AttendeeStatus;

    @Column({ type: "timestamptz", nullable: true })
    checked_in_at!: Date | null;

    @Column({
        type: "enum",
        enum: ["app", "manual"],
        default: "app",
    })
    method!: AttendeeMethod;

    @Column({ nullable: true })
    manual_note!: string;

    @Column({ type: "timestamptz", nullable: true })
    pre_registered_at!: Date | null;

    @CreateDateColumn()
    created_at!: Date;

    @UpdateDateColumn()
    updated_at!: Date;
}
