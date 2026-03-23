import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn, OneToMany,
} from "typeorm";
import { Member } from "./Member";
import { Meeting } from "./Meeting";

@Entity("communities")
export class Community {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column()
    name!: string;

    @Column({ nullable: true })
    slug!: string;

    @Column({ nullable: true })
    facilitator_ename!: string;

    @Column({ type: "text", nullable: true })
    logo_url!: string; // base64 data URL or external URL

    @Column({ nullable: true, default: "#C4622D" })
    primary_color!: string;

    @Column({ nullable: true, default: "Playfair Display" })
    title_font!: string;

    @Column({ type: "jsonb", default: [] })
    locations!: object[];

    @OneToMany(() => Member, (m) => m.community)
    members!: Member[];

    @OneToMany(() => Meeting, (m) => m.community)
    meetings!: Meeting[];

    @CreateDateColumn()
    created_at!: Date;

    @UpdateDateColumn()
    updated_at!: Date;
}
