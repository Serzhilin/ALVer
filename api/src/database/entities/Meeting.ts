import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn, OneToMany,
} from "typeorm";
import { Attendee } from "./Attendee";
import { Mandate } from "./Mandate";
import { Poll } from "./Poll";

export type MeetingStatus = "draft" | "published" | "open" | "in_session" | "closed" | "archived";

@Entity("meetings")
export class Meeting {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    // W3DS fields — unused locally, present for clean eVault mapping later
    @Column({ nullable: true })
    ontology_id!: string;

    @Column({ type: "jsonb", nullable: true })
    acl!: object;

    @Column()
    name!: string;

    @Column({ type: "date" })
    date!: string;

    @Column({ length: 5 })
    time!: string;

    @Column()
    location!: string;

    @Column({ type: "text" })
    agenda_text!: string;

    @Column({
        type: "enum",
        enum: ["draft", "published", "open", "in_session", "closed", "archived"],
        default: "draft",
    })
    status!: MeetingStatus;

    @Column({ nullable: true })
    facilitator_name!: string;

    @Column({ nullable: true })
    facilitator_ename!: string;

    @OneToMany(() => Attendee, (a) => a.meeting)
    attendees!: Attendee[];

    @OneToMany(() => Mandate, (m) => m.meeting)
    mandates!: Mandate[];

    @OneToMany(() => Poll, (p) => p.meeting)
    polls!: Poll[];

    @CreateDateColumn()
    created_at!: Date;

    @UpdateDateColumn()
    updated_at!: Date;
}
