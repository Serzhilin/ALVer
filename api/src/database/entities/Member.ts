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

    /** Computed from first_name + last_name — used for check-in name matching */
    @Column()
    name!: string;

    @Column({ nullable: true })
    first_name!: string;

    @Column({ nullable: true })
    last_name!: string;

    @Column({ nullable: true })
    email!: string;

    @Column({ nullable: true })
    phone!: string;

    /** W3DS eID identity name — links to login */
    @Column({ nullable: true })
    ename!: string;

    @Column({ default: false })
    is_aspirant!: boolean;

    /** True for the community facilitator — hidden in general lists */
    @Column({ default: false })
    is_facilitator!: boolean;

    @CreateDateColumn()
    created_at!: Date;

    @UpdateDateColumn()
    updated_at!: Date;
}
