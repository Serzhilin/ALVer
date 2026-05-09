import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, ManyToOne, JoinColumn, Index,
} from "typeorm";
import { Meeting } from "./Meeting";

export type AttendanceStatus = "attended" | "mandated" | "absent";

@Entity("meeting_attendance_records")
@Index(["meeting_id", "member_ename"], { unique: true, where: "member_ename IS NOT NULL" })
@Index(["meeting_id", "member_name"], { unique: true, where: "member_ename IS NULL" })
export class MeetingAttendanceRecord {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @ManyToOne(() => Meeting, { onDelete: "CASCADE" })
    @JoinColumn({ name: "meeting_id" })
    meeting!: Meeting;

    @Column("uuid")
    meeting_id!: string;

    @Column("uuid", { nullable: true })
    community_id!: string;

    @Column({ nullable: true })
    member_ename!: string;

    @Column()
    member_name!: string;

    @Column({ default: false })
    is_aspirant!: boolean;

    @Column({
        type: "enum",
        enum: ["attended", "mandated", "absent"],
    })
    status!: AttendanceStatus;

    // Filled when status = 'mandated': the proxy who held their vote
    @Column({ nullable: true })
    proxy_ename!: string;

    @Column({ nullable: true })
    proxy_name!: string;

    @CreateDateColumn()
    recorded_at!: Date;
}
