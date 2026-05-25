import {
    Entity, PrimaryGeneratedColumn, Column,
    CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from "typeorm";
import { Community } from "./Community";

@Entity("members")
export class Member {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @ManyToOne(() => Community, (c) => c.members, { onDelete: "CASCADE" })
    @JoinColumn({ name: "community_id" })
    community!: Community;

    @Column("uuid")
    community_id!: string;

    /** Paperwork name — shown everywhere in the app. Never overwritten by eVault pull. */
    @Column({ nullable: true })
    app_first_name!: string | null;

    @Column({ nullable: true })
    app_last_name!: string | null;

    /** eVault-pulled name — shown only in Members form (admin view). */
    @Column({ nullable: true })
    first_name!: string | null;

    @Column({ nullable: true })
    last_name!: string | null;

    /** Avatar URL from eVault profile. Shown in Members form. */
    @Column({ nullable: true })
    avatar_url!: string | null;

    @Column({ nullable: true })
    email!: string | null;

    @Column({ nullable: true })
    phone!: string | null;

    /** W3DS eID identity — nullable. Members without ename are managed manually. */
    @Column({ nullable: true })
    ename!: string | null;

    @Column({ default: false })
    is_aspirant!: boolean;

    @Column({ default: false })
    is_facilitator!: boolean;

    @CreateDateColumn()
    created_at!: Date;

    @UpdateDateColumn()
    updated_at!: Date;
}
