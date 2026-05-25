# Member Identity Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace dual User/Member identity with Member as canonical entity — add app_first_name/app_last_name for paperwork names, remove ILike name fallbacks, redirect eVault pull to Member fields.

**Architecture:** Additive DB migration first (zero risk), then backend services one at a time, frontend last. Each task is independently committable and testable. Cleanup phase (drop users table, change JWT) is a **separate future plan** — not in scope here.

**Tech Stack:** TypeScript, Express, TypeORM, PostgreSQL 5433, React/Vite. No test framework — use `npx tsc --noEmit` for type safety + manual curl/browser smoke tests.

**Spec:** `docs/superpowers/specs/2026-05-25-member-identity-consolidation-design.md`

---

## File Map

**New files:**
- `api/src/lib/member-display.ts` — `appDisplayName()` and `appDisplayNameShort()` pure functions

**DB migrations:**
- `api/src/database/migrations/1777100000000-MemberIdentityConsolidation.ts`

**Modified — backend:**
- `api/src/database/entities/Member.ts` — add `app_first_name`, `app_last_name`, `avatar_url`
- `api/src/database/entities/Vote.ts` — add `voter_member_id` (nullable, for ename-less dedup)
- `api/src/services/CommunityService.ts` — update createMember/updateMember, remove `name` field, make ename optional
- `api/src/services/UserService.ts` — update `fetchEVaultProfile` to also return `avatar_url`
- `api/src/controllers/AuthController.ts` — eVault pull → Member fields; replace `serializeUser` with `serializeMember`; remove `findById(userId)` from `getMe`
- `api/src/services/AttendeeService.ts` — rewrite checkIn to accept `ename | member_id`, delete `resolveMember()`
- `api/src/controllers/AttendeeController.ts` — update `checkIn` and `manualAdd` signatures
- `api/src/services/MandateService.ts` — replace name lookups with granter_ename (from JWT) + proxy_member_id
- `api/src/controllers/MandateController.ts` — pass granter_ename from JWT
- `api/src/services/VoteService.ts` — remove ILike name fallback, add member_id dedup

**Modified — frontend:**
- `app/src/components/MembersModal.jsx` — add app_first_name/app_last_name fields, eVault read-only section, optional ename
- `app/src/views/Facilitate.jsx` — check-in picker sends member_id; display uses app names
- `app/src/views/Home.jsx` — mandate proxy picker sends member_id
- `app/src/views/Attend.jsx` — self check-in uses ename from JWT; display uses app names
- `app/src/context/MeetingContext.jsx` — update checkIn and addMandate API call signatures

---

## Task 1: DB Migration

**Files:**
- Create: `api/src/database/migrations/1777100000000-MemberIdentityConsolidation.ts`

- [ ] **Step 1: Create the migration file**

```typescript
// api/src/database/migrations/1777100000000-MemberIdentityConsolidation.ts
import { MigrationInterface, QueryRunner } from "typeorm";

export class MemberIdentityConsolidation1777100000000 implements MigrationInterface {
    name = "MemberIdentityConsolidation1777100000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Add new name columns to members
        await queryRunner.query(`ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "app_first_name" character varying`);
        await queryRunner.query(`ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "app_last_name" character varying`);
        await queryRunner.query(`ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "avatar_url" character varying`);

        // 2. Copy existing first_name/last_name → app names (preserve paperwork data)
        await queryRunner.query(`UPDATE "members" SET "app_first_name" = "first_name" WHERE "app_first_name" IS NULL`);
        await queryRunner.query(`UPDATE "members" SET "app_last_name" = "last_name" WHERE "app_last_name" IS NULL`);

        // 3. Partial unique index: one ename per community (nulls excluded)
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_members_community_ename"
            ON "members" ("community_id", "ename")
            WHERE "ename" IS NOT NULL
        `);

        // 4. Add voter_member_id to votes (nullable — for dedup of ename-less voters)
        await queryRunner.query(`ALTER TABLE "votes" ADD COLUMN IF NOT EXISTS "voter_member_id" uuid`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_members_community_ename"`);
        await queryRunner.query(`ALTER TABLE "members" DROP COLUMN IF EXISTS "app_first_name"`);
        await queryRunner.query(`ALTER TABLE "members" DROP COLUMN IF EXISTS "app_last_name"`);
        await queryRunner.query(`ALTER TABLE "members" DROP COLUMN IF EXISTS "avatar_url"`);
        await queryRunner.query(`ALTER TABLE "votes" DROP COLUMN IF EXISTS "voter_member_id"`);
    }
}
```

- [ ] **Step 2: Run the migration**

```bash
cd ~/Projects/ALVer/api
npx typeorm-ts-node-commonjs migration:run -d src/database/data-source.ts
```

Expected: `MemberIdentityConsolidation1777100000000 has been executed successfully.`

- [ ] **Step 3: Verify columns exist**

```bash
psql -p 5433 -U postgres -d alver -c "\d members" | grep -E "app_first|app_last|avatar"
psql -p 5433 -U postgres -d alver -c "\d votes" | grep voter_member
psql -p 5433 -U postgres -d alver -c "SELECT count(*) FROM members WHERE app_first_name IS NOT NULL;"
```

Expected: columns present, count matches your existing member count.

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/ALVer
git add api/src/database/migrations/1777100000000-MemberIdentityConsolidation.ts
git commit -m "feat: migration — add app_first_name, app_last_name, avatar_url to members; voter_member_id to votes"
```

---

## Task 2: Member Entity + appDisplayName

**Files:**
- Modify: `api/src/database/entities/Member.ts`
- Modify: `api/src/database/entities/Vote.ts`
- Create: `api/src/lib/member-display.ts`

- [ ] **Step 1: Update Member entity**

Replace the contents of `api/src/database/entities/Member.ts`:

```typescript
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
```

- [ ] **Step 2: Add voter_member_id to Vote entity**

Open `api/src/database/entities/Vote.ts` and add after the last `@Column` before `created_at`:

```typescript
    /** Member ID of voter — used for dedup when voter has no ename. */
    @Column("uuid", { nullable: true })
    voter_member_id!: string | null;
```

- [ ] **Step 3: Create member-display.ts**

```typescript
// api/src/lib/member-display.ts

interface NameFields {
    app_first_name?: string | null;
    app_last_name?: string | null;
}

/** Full name from paperwork fields: "Truus Weesjes" */
export function appDisplayName(member: NameFields): string {
    const first = member.app_first_name?.trim() ?? "";
    const last = member.app_last_name?.trim() ?? "";
    if (first && last) return `${first} ${last}`;
    return first || last || "?";
}

/** Compact name: "Truus W." — use in lists, attendee rows */
export function appDisplayNameShort(member: NameFields): string {
    const first = member.app_first_name?.trim() ?? "";
    const lastInitial = member.app_last_name?.trim()?.[0] ?? "";
    if (first && lastInitial) return `${first} ${lastInitial}.`;
    return appDisplayName(member);
}
```

- [ ] **Step 4: Type check**

```bash
cd ~/Projects/ALVer/api && npx tsc --noEmit
```

Expected: 0 errors (existing `name` column references may surface — fix in later tasks by removing those references).

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/ALVer
git add api/src/database/entities/Member.ts api/src/database/entities/Vote.ts api/src/lib/member-display.ts
git commit -m "feat: Member entity add app name fields and avatar_url; Vote add voter_member_id; add appDisplayName helpers"
```

---

## Task 3: CommunityService — member create/update

**Files:**
- Modify: `api/src/services/CommunityService.ts`

Changes: `createMember` uses app names + makes ename optional; `updateMember` uses app names; remove `findMemberByName` and `findByMemberEname`; remove `name` field everywhere; update `upsertFacilitatorMember`.

- [ ] **Step 1: Update createMember**

Replace `createMember` method (currently lines ~159–182):

```typescript
async createMember(communityId: string, data: {
    app_first_name: string;
    app_last_name: string;
    email?: string;
    phone?: string;
    ename?: string;
    is_aspirant?: boolean;
    is_facilitator?: boolean;
}): Promise<Member> {
    const member = this.memberRepo.create({
        community_id: communityId,
        app_first_name: data.app_first_name.trim(),
        app_last_name: data.app_last_name.trim(),
        email: data.email || null,
        phone: data.phone || null,
        ename: data.ename?.trim() || null,
        is_aspirant: data.is_aspirant ?? false,
        is_facilitator: data.is_facilitator ?? false,
    });
    return this.memberRepo.save(member);
}
```

- [ ] **Step 2: Update updateMember**

Replace `updateMember` method:

```typescript
async updateMember(id: string, data: Partial<Pick<Member,
    "app_first_name" | "app_last_name" | "email" | "phone" | "ename" | "is_aspirant" | "is_facilitator"
>>): Promise<Member> {
    const member = await this.memberRepo.findOneByOrFail({ id });
    Object.assign(member, data);
    return this.memberRepo.save(member);
}
```

- [ ] **Step 3: Update upsertFacilitatorMember**

Replace `upsertFacilitatorMember` method (currently ~lines 135–157):

```typescript
async upsertFacilitatorMember(communityId: string, ename: string, appFirst: string, appLast: string): Promise<Member> {
    let member = await this.memberRepo.findOne({ where: { community_id: communityId, ename } });
    if (!member) {
        member = this.memberRepo.create({
            community_id: communityId,
            ename,
            app_first_name: appFirst || null,
            app_last_name: appLast || null,
            is_facilitator: true,
        });
    } else {
        member.is_facilitator = true;
    }
    return this.memberRepo.save(member);
}
```

- [ ] **Step 4: Remove findMemberByName and findByMemberEname**

Delete these two methods entirely from CommunityService:
- `findMemberByName(communityId, name)` — no longer used (name column gone)
- `findByMemberEname(ename)` — global search removed per spec; `getMyCommunities` handles discovery

- [ ] **Step 5: Type check**

```bash
cd ~/Projects/ALVer/api && npx tsc --noEmit
```

Fix any callers that still pass `first_name`/`last_name` to `createMember` — the CommunityController will be updated in Step 6.

- [ ] **Step 6: Update CommunityController createMember and updateMember**

Open `api/src/controllers/CommunityController.ts` and update the `createMember` handler to read `app_first_name`, `app_last_name` from request body instead of `first_name`, `last_name`:

```typescript
// In createMember handler — replace the svc.createMember(...) call:
const { app_first_name, app_last_name, email, phone, ename, is_aspirant, is_facilitator } = req.body;
if (!app_first_name?.trim() || !app_last_name?.trim()) {
    return res.status(400).json({ error: "app_first_name and app_last_name are required" });
}
const member = await svc.createMember(community.id, {
    app_first_name,
    app_last_name,
    email,
    phone,
    ename: ename?.trim() || undefined,
    is_aspirant,
    is_facilitator,
});
```

For `updateMember` handler, change to pass `app_first_name`, `app_last_name` from body (remove `name`, `first_name`, `last_name` from data passed to service):

```typescript
const { app_first_name, app_last_name, email, phone, ename, is_aspirant, is_facilitator } = req.body;
const member = await svc.updateMember(req.params.memberId, {
    app_first_name: app_first_name?.trim() || undefined,
    app_last_name: app_last_name?.trim() || undefined,
    email,
    phone,
    ename: ename?.trim() || null,
    is_aspirant,
    is_facilitator,
});
```

- [ ] **Step 7: Type check**

```bash
cd ~/Projects/ALVer/api && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 8: Smoke test — start API and create a member**

```bash
cd ~/Projects/ALVer/api && npm run dev &
sleep 3

# Get a facilitator JWT first (use dev-login)
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/dev-login | jq -r '.token')
COMMUNITY_ID=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/community | jq -r '.id')

# Create member with new fields
curl -s -X POST http://localhost:3001/api/community/members \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"app_first_name\":\"Test\",\"app_last_name\":\"Persoon\"}" | jq .
```

Expected: member object with `app_first_name: "Test"`, `app_last_name: "Persoon"`, `ename: null`.

- [ ] **Step 9: Commit**

```bash
cd ~/Projects/ALVer
git add api/src/services/CommunityService.ts api/src/controllers/CommunityController.ts
git commit -m "feat: CommunityService use app_first_name/app_last_name; ename optional; remove name-based member lookups"
```

---

## Task 4: AuthController — eVault pull to Member + serializeMember

**Files:**
- Modify: `api/src/services/UserService.ts`
- Modify: `api/src/controllers/AuthController.ts`

- [ ] **Step 1: Update fetchEVaultProfile to return avatar_url**

In `api/src/services/UserService.ts`, update the return type and body of `fetchEVaultProfile`:

```typescript
export async function fetchEVaultProfile(
    ename: string
): Promise<{ first_name: string; last_name: string; avatar_url?: string } | null> {
```

In the merge section, after building `merged`, add:

```typescript
        const avatarUrl: string | undefined =
            merged.avatarUrl ?? merged.avatar ?? merged.picture ?? undefined;

        const displayName: string = merged.displayName ?? merged.name ?? "";
        if (!displayName && !merged.firstName) return null;

        const parts = displayName.trim().split(/\s+/);
        return {
            first_name: merged.firstName ?? parts[0] ?? "",
            last_name: merged.lastName ?? (parts.length > 1 ? parts[parts.length - 1] : ""),
            avatar_url: avatarUrl,
        };
```

- [ ] **Step 2: Rewrite AuthController epassportLogin — pull to Member**

Open `api/src/controllers/AuthController.ts`.

Add import at top:

```typescript
import { appDisplayName } from "../lib/member-display";
```

In `epassportLogin`, replace the block that calls `fetchEVaultProfile` and updates User (currently lines ~105–114) with:

```typescript
    // Pull eVault profile → update Member's eVault name fields (never touches app names)
    const profile = await fetchEVaultProfile(ename);
    if (profile) {
        const { CommunityService } = await import("../services/CommunityService");
        const cs = new CommunityService();
        const members = await cs.findMembersByEname(ename);
        for (const member of members) {
            await cs.updateMemberEvaultFields(member.id, {
                first_name: profile.first_name,
                last_name: profile.last_name,
                avatar_url: profile.avatar_url ?? null,
            });
        }
    }
```

- [ ] **Step 3: Add findMembersByEname and updateMemberEvaultFields to CommunityService**

In `api/src/services/CommunityService.ts`, add two new methods:

```typescript
/** All Member rows across all communities for this ename */
async findMembersByEname(ename: string): Promise<Member[]> {
    return this.memberRepo.find({ where: { ename } });
}

/** Update eVault-sourced fields only — never touches app_first_name/app_last_name */
async updateMemberEvaultFields(id: string, data: {
    first_name: string;
    last_name: string;
    avatar_url: string | null;
}): Promise<void> {
    await this.memberRepo.update(id, data);
}
```

- [ ] **Step 4: Replace serializeUser with serializeMember in AuthController**

Replace the `serializeUser` function:

```typescript
function serializeMember(ename: string, member: import("../database/entities/Member").Member | null) {
    return {
        ename,
        firstName: member?.app_first_name ?? null,
        lastName: member?.app_last_name ?? null,
        displayName: member ? appDisplayName(member) : ename,
    };
}
```

- [ ] **Step 5: Update getMe — remove findById(userId), remove findByMemberEname**

Replace the full `getMe` function:

```typescript
export async function getMe(req: Request, res: Response) {
    const { ename } = req.user!;
    const communityId = typeof req.query.communityId === "string" ? req.query.communityId : null;
    const { CommunityService } = await import("../services/CommunityService");
    const cs = new CommunityService();

    let community = null;
    let member = null;

    if (communityId) {
        community = await cs.findById(communityId);
        if (!community) { res.status(404).json({ error: "Community not found" }); return; }
        member = ename ? await cs.findMemberByEname(community.id, ename) : null;
    } else {
        community = ename ? await cs.findAsFacilitator(ename) : null;
        member = (community && ename) ? await cs.findMemberByEname(community.id, ename) : null;
    }

    const isFacilitator = member?.is_facilitator ??
        (community != null && community.facilitator_ename === ename);

    if (isFacilitator && !member && community && ename) {
        const appFirst = member?.app_first_name ?? "";
        const appLast = member?.app_last_name ?? "";
        member = await cs.upsertFacilitatorMember(community.id, ename, appFirst, appLast);
    }

    res.json({ ...serializeMember(ename ?? "", member), community, member, isFacilitator });
}
```

- [ ] **Step 6: Update devLogin — no userId in token**

`devLogin` already calls `signToken({ userId: user.id, ename: user.ename })`. Leave it unchanged for now — userId in JWT is harmless during the transition; it's just unused server-side.

- [ ] **Step 7: Remove unused imports from AuthController**

Remove `findById`, `updateUser` imports from UserService (they're no longer called in AuthController). Keep `findOrCreateByEname`, `fetchEVaultProfile`, `displayName`.

Actually: `displayName` from UserService is no longer needed — replaced by `appDisplayName`. Remove that import too.

- [ ] **Step 8: Type check**

```bash
cd ~/Projects/ALVer/api && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 9: Smoke test**

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/dev-login | jq -r '.token')
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3001/api/auth/me" | jq '{firstName, lastName, displayName, ename}'
```

Expected: `firstName` and `lastName` come from the facilitator member's `app_first_name`/`app_last_name`.

- [ ] **Step 10: Commit**

```bash
cd ~/Projects/ALVer
git add api/src/services/UserService.ts api/src/services/CommunityService.ts api/src/controllers/AuthController.ts
git commit -m "feat: eVault pull targets Member fields; replace serializeUser with serializeMember; remove userId lookup from getMe"
```

---

## Task 5: AttendeeService — ename or member_id, no ILike

**Files:**
- Modify: `api/src/services/AttendeeService.ts`
- Modify: `api/src/controllers/AttendeeController.ts`

The check-in endpoint splits into two clear paths:
- `POST /api/meetings/:id/attendees/checkin` — W3DS self-check-in, ename from JWT
- `POST /api/meetings/:id/attendees/manual` — facilitator manual, sends `{ member_id }`

- [ ] **Step 1: Rewrite AttendeeService**

Replace full contents of `api/src/services/AttendeeService.ts`:

```typescript
import { AppDataSource } from "../database/data-source";
import { Attendee } from "../database/entities/Attendee";
import { Meeting } from "../database/entities/Meeting";
import { Member } from "../database/entities/Member";
import { sseService } from "./SSEService";
import { appDisplayName } from "../lib/member-display";

export class AttendeeService {
    private repo = AppDataSource.getRepository(Attendee);
    private meetingRepo = AppDataSource.getRepository(Meeting);
    private memberRepo = AppDataSource.getRepository(Member);

    /** W3DS self-check-in: person identified by their ename from JWT */
    async checkInByEname(meetingId: string, ename: string): Promise<Attendee> {
        const meeting = await this.meetingRepo.findOneBy({ id: meetingId });
        if (!meeting) throw new Error("Meeting not found");
        if (meeting.status === "draft" || meeting.status === "archived") {
            throw new Error("Check-in is not available for this meeting");
        }

        const member = meeting.community_id
            ? await this.memberRepo.findOne({ where: { community_id: meeting.community_id, ename } })
            : null;

        if (meeting.community_id && !member) throw new Error("not_a_member");

        const name = member ? appDisplayName(member) : ename;

        // Dedup: already checked in by ename?
        let attendee = await this.repo.findOne({ where: { meeting_id: meetingId, attendee_ename: ename } });

        if (attendee && attendee.status === "checked_in") return attendee;

        if (attendee) {
            await this.repo.update(attendee.id, {
                status: "checked_in",
                checked_in_at: new Date(),
                method: "app",
                attendee_name: name,
                attendee_ename: ename,
                member_id: member?.id ?? attendee.member_id,
                is_aspirant: member?.is_aspirant ?? attendee.is_aspirant,
            });
        } else {
            attendee = this.repo.create({
                meeting_id: meetingId,
                member_id: member?.id ?? undefined,
                attendee_name: name,
                attendee_ename: ename,
                is_aspirant: member?.is_aspirant ?? false,
                status: "checked_in",
                checked_in_at: new Date(),
                method: "app",
            });
            try {
                attendee = await this.repo.save(attendee);
            } catch (e: any) {
                if (e.code === "23505") {
                    const existing = await this.repo.findOne({ where: { meeting_id: meetingId, attendee_ename: ename } });
                    if (existing) return existing;
                }
                throw e;
            }
        }

        attendee = await this.repo.findOneByOrFail({ id: attendee.id });
        sseService.emit(meetingId, "attendee_checked_in", {
            meetingId,
            attendee: { id: attendee.id, name: attendee.attendee_name, method: attendee.method, is_aspirant: attendee.is_aspirant },
        });
        return attendee;
    }

    /** Facilitator manual check-in: person identified by member_id UUID */
    async checkInByMemberId(meetingId: string, memberId: string, note?: string): Promise<Attendee> {
        const meeting = await this.meetingRepo.findOneBy({ id: meetingId });
        if (!meeting) throw new Error("Meeting not found");
        if (meeting.status === "draft" || meeting.status === "archived") {
            throw new Error("Check-in is not available for this meeting");
        }

        const member = await this.memberRepo.findOneByOrFail({ id: memberId });
        const name = appDisplayName(member);

        // Dedup: already checked in via member_id?
        let attendee = member.ename
            ? await this.repo.findOne({ where: { meeting_id: meetingId, attendee_ename: member.ename } })
            : await this.repo.findOne({ where: { meeting_id: meetingId, member_id: memberId } });

        if (attendee && attendee.status === "checked_in") return attendee;

        if (attendee) {
            await this.repo.update(attendee.id, {
                status: "checked_in",
                checked_in_at: new Date(),
                method: "manual",
                manual_note: note,
                attendee_name: name,
                attendee_ename: member.ename ?? attendee.attendee_ename,
                member_id: memberId,
                is_aspirant: member.is_aspirant,
            });
        } else {
            attendee = this.repo.create({
                meeting_id: meetingId,
                member_id: memberId,
                attendee_name: name,
                attendee_ename: member.ename ?? undefined,
                is_aspirant: member.is_aspirant,
                status: "checked_in",
                checked_in_at: new Date(),
                method: "manual",
                manual_note: note,
            });
            attendee = await this.repo.save(attendee);
        }

        attendee = await this.repo.findOneByOrFail({ id: attendee.id });
        sseService.emit(meetingId, "attendee_checked_in", {
            meetingId,
            attendee: { id: attendee.id, name: attendee.attendee_name, method: attendee.method, is_aspirant: attendee.is_aspirant },
        });
        return attendee;
    }

    async listForMeeting(meetingId: string): Promise<Attendee[]> {
        return this.repo.find({
            where: { meeting_id: meetingId },
            order: { checked_in_at: "ASC" },
        });
    }

    async findCheckedInByEname(meetingId: string, ename: string): Promise<Attendee | null> {
        return this.repo.findOne({
            where: { meeting_id: meetingId, attendee_ename: ename, status: "checked_in" },
        });
    }

    async findCheckedInByMemberId(meetingId: string, memberId: string): Promise<Attendee | null> {
        return this.repo.findOne({
            where: { meeting_id: meetingId, member_id: memberId, status: "checked_in" },
        });
    }

    async update(attendeeId: string, data: Partial<Attendee>): Promise<Attendee> {
        await this.repo.update(attendeeId, data);
        return this.repo.findOneByOrFail({ id: attendeeId });
    }

    async delete(attendeeId: string): Promise<void> {
        await this.repo.delete(attendeeId);
    }
}
```

- [ ] **Step 2: Update AttendeeController**

Replace full contents of `api/src/controllers/AttendeeController.ts`:

```typescript
import { Request, Response } from "express";
import { AttendeeService } from "../services/AttendeeService";

const svc = new AttendeeService();

export class AttendeeController {
    /** W3DS self-check-in — requires JWT, ename used for identity */
    checkIn = async (req: Request, res: Response) => {
        try {
            const ename = req.user?.ename;
            if (!ename) return res.status(401).json({ error: "Authentication required" });
            const attendee = await svc.checkInByEname(req.params.id, ename);
            res.json(attendee);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    };

    /** Facilitator manual check-in — requires member_id in body */
    manualAdd = async (req: Request, res: Response) => {
        try {
            const { member_id, note } = req.body;
            if (!member_id) return res.status(400).json({ error: "member_id is required" });
            const attendee = await svc.checkInByMemberId(req.params.id, member_id, note);
            res.status(201).json(attendee);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    };

    list = async (req: Request, res: Response) => {
        try {
            const attendees = await svc.listForMeeting(req.params.id);
            res.json(attendees);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    };

    update = async (req: Request, res: Response) => {
        try {
            const attendee = await svc.update(req.params.attendeeId, req.body);
            res.json(attendee);
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    };

    delete = async (req: Request, res: Response) => {
        try {
            await svc.delete(req.params.attendeeId);
            res.status(204).send();
        } catch (e: any) {
            res.status(400).json({ error: e.message });
        }
    };
}
```

**Remove preRegister from index.ts:** The `preRegister` method was name-based and is removed from the controller. Remove this line from `api/src/index.ts`:

```typescript
// DELETE this line:
app.post("/api/meetings/:id/attendees", attendee.preRegister);
```

Also remove `preRegister` from the `AttendeeController` class and from `AttendeeService` if no other code calls it. Check frontend for any `api.post('/attendees')` calls (not `/attendees/checkin` or `/attendees/manual`) — if found, port them to use `member_id` via the manual endpoint.

- [ ] **Step 3: Type check**

```bash
cd ~/Projects/ALVer/api && npx tsc --noEmit
```

- [ ] **Step 4: Smoke test — manual check-in**

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/dev-login | jq -r '.token')
MEETING_ID=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/meetings | jq -r '.[0].id')
MEMBER_ID=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/community/members | jq -r '.[0].id')

curl -s -X POST "http://localhost:3001/api/meetings/$MEETING_ID/attendees/manual" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"member_id\":\"$MEMBER_ID\"}" | jq .
```

Expected: attendee object with `attendee_name` populated from member's app names, `method: "manual"`.

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/ALVer
git add api/src/services/AttendeeService.ts api/src/controllers/AttendeeController.ts
git commit -m "feat: AttendeeService rewrite — checkInByEname and checkInByMemberId; delete ILike resolveMember"
```

---

## Task 6: MandateService — granter from JWT, proxy by member_id

**Files:**
- Modify: `api/src/services/MandateService.ts`
- Modify: `api/src/controllers/MandateController.ts`

- [ ] **Step 1: Rewrite MandateService.create**

Open `api/src/services/MandateService.ts`. Replace the `create` method:

```typescript
async create(meetingId: string, data: {
    granter_ename: string;        // from JWT — the logged-in person giving the mandate
    proxy_member_id: string;      // UUID of the proxy — selected from member picker
    scope_note?: string;
}): Promise<Mandate> {
    const meetingRepo = AppDataSource.getRepository(Meeting);
    const memberRepo = AppDataSource.getRepository(Member);
    const attendeeRepo = AppDataSource.getRepository(Attendee);

    const meeting = await meetingRepo.findOneBy({ id: meetingId });
    if (!meeting) throw new Error("Meeting not found");

    const proxyMember = await memberRepo.findOneByOrFail({ id: data.proxy_member_id });
    if (proxyMember.is_aspirant) throw new Error("Aspirants cannot receive mandates");

    const granterMember = meeting.community_id
        ? await memberRepo.findOne({ where: { community_id: meeting.community_id, ename: data.granter_ename } })
        : null;

    const granter_name = granterMember
        ? `${granterMember.app_first_name ?? ""} ${granterMember.app_last_name ?? ""}`.trim()
        : data.granter_ename;
    const proxy_name = `${proxyMember.app_first_name ?? ""} ${proxyMember.app_last_name ?? ""}`.trim();
    const proxy_ename = proxyMember.ename ?? undefined;

    // Verify proxy is checked in
    const proxyAttendee = proxyMember.ename
        ? await attendeeRepo.findOne({ where: { meeting_id: meetingId, attendee_ename: proxyMember.ename, status: "checked_in" } })
        : await attendeeRepo.findOne({ where: { meeting_id: meetingId, member_id: proxyMember.id, status: "checked_in" } });
    if (!proxyAttendee) throw new Error("Proxy must be checked in to the meeting");

    // Revoke any existing active mandate from granter
    await this.revokeByGranterEname(meetingId, data.granter_ename);

    const mandate = this.repo.create({
        meeting_id: meetingId,
        granter_name,
        granter_ename: data.granter_ename,
        proxy_name,
        proxy_ename,
        scope_note: data.scope_note,
        status: "active",
    });
    return this.repo.save(mandate);
}
```

- [ ] **Step 2: Add revokeByGranterEname method**

Add after the existing `revokeByGranter` method:

```typescript
async revokeByGranterEname(meetingId: string, granterEname: string): Promise<void> {
    const mandates = await this.repo.find({
        where: { meeting_id: meetingId, granter_ename: granterEname, status: "active" },
    });
    for (const m of mandates) {
        await this.repo.delete(m.id);
    }
}
```

- [ ] **Step 3: Update MandateController.create**

Replace `create` method in `api/src/controllers/MandateController.ts`:

```typescript
create = async (req: Request, res: Response) => {
    try {
        const granter_ename = req.user?.ename;
        if (!granter_ename) return res.status(401).json({ error: "Authentication required" });
        const { proxy_member_id, scope_note } = req.body;
        if (!proxy_member_id) {
            return res.status(400).json({ error: "proxy_member_id is required" });
        }
        const mandate = await svc.create(req.params.id, { granter_ename, proxy_member_id, scope_note });
        sseService.emit(req.params.id, "mandate_updated", { meetingId: req.params.id });
        res.status(201).json(mandate);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
};
```

- [ ] **Step 4: Type check**

```bash
cd ~/Projects/ALVer/api && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/ALVer
git add api/src/services/MandateService.ts api/src/controllers/MandateController.ts
git commit -m "feat: MandateService use granter_ename from JWT and proxy_member_id; remove ILike name lookup"
```

---

## Task 7: VoteService — remove ILike name fallback

**Files:**
- Modify: `api/src/services/VoteService.ts`

- [ ] **Step 1: Read full VoteService and add IsNull import**

```bash
cat ~/Projects/ALVer/api/src/services/VoteService.ts
```

Ensure `IsNull` is imported from typeorm at the top of the file:

```typescript
import { IsNull } from "typeorm";
```

- [ ] **Step 2: Update voter dedup in cast()**

Find the dedup section (currently tries ename first, then ILike name). Replace with:

```typescript
// Dedup: find existing vote by ename (W3DS voter) or by member_id (manual voter)
let existing: Vote | null = null;
if (data.voter_ename) {
    existing = await this.voteRepo.findOne({
        where: { poll_id: pollId, voter_ename: data.voter_ename, on_behalf_of_name: data.on_behalf_of_name ?? IsNull() },
    });
}
if (!existing && data.voter_member_id) {
    existing = await this.voteRepo.findOne({
        where: { poll_id: pollId, voter_member_id: data.voter_member_id, on_behalf_of_name: data.on_behalf_of_name ?? IsNull() },
    });
}
if (existing) return existing;
```

- [ ] **Step 3: Update checked-in verification in cast()**

Find the section that verifies voter is checked in (currently by ename then name). Replace with:

```typescript
let checkedInAttendee: Attendee | null = null;
if (data.voter_ename) {
    checkedInAttendee = await attendeeRepo.findOne({
        where: { meeting_id: poll.meeting_id, attendee_ename: data.voter_ename, status: "checked_in" },
    });
}
if (!checkedInAttendee && data.voter_member_id) {
    checkedInAttendee = await attendeeRepo.findOne({
        where: { meeting_id: poll.meeting_id, member_id: data.voter_member_id, status: "checked_in" },
    });
}
if (!checkedInAttendee) throw new Error("voter_not_checked_in");
```

- [ ] **Step 4: Store voter_member_id when creating vote**

When creating the Vote entity, add `voter_member_id`:

```typescript
voter_member_id: checkedInAttendee.member_id ?? null,
```

- [ ] **Step 5: Remove ILike import** from VoteService if it's now unused.

- [ ] **Step 6: Type check**

```bash
cd ~/Projects/ALVer/api && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
cd ~/Projects/ALVer
git add api/src/services/VoteService.ts
git commit -m "feat: VoteService dedup by ename or member_id; remove ILike name fallback"
```

---

## Task 8: Frontend — MembersModal

**Files:**
- Modify: `app/src/components/MembersModal.jsx`

- [ ] **Step 1: Update form state and empty template**

At the top of MembersModal, replace the `EMPTY` constant and the form init in `toForm`:

```javascript
const EMPTY = {
  app_first_name: '', app_last_name: '',
  email: '', phone: '', ename: '',
  is_aspirant: false, is_facilitator: false
}

function toForm(m) {
  if (!m) return EMPTY
  return {
    app_first_name: m.app_first_name || '',
    app_last_name:  m.app_last_name  || '',
    email:          m.email          || '',
    phone:          m.phone          || '',
    ename:          m.ename          || '',
    is_aspirant:    m.is_aspirant    || false,
    is_facilitator: m.is_facilitator || false,
  }
}
```

- [ ] **Step 2: Update save validation and payload**

Replace the save handler's validation and the data object sent to API:

```javascript
// Validation — ename no longer required
if (!form.app_first_name.trim() || !form.app_last_name.trim()) return

const payload = {
  app_first_name: form.app_first_name.trim(),
  app_last_name:  form.app_last_name.trim(),
  email:          form.email.trim() || null,
  phone:          form.phone.trim() || null,
  ename:          form.ename.trim() || null,
  is_aspirant:    form.is_aspirant,
  is_facilitator: form.is_facilitator,
}
```

- [ ] **Step 3: Update form fields in JSX**

Replace `first_name`/`last_name` input fields with `app_first_name`/`app_last_name`:

```jsx
<input
  className="input"
  value={form.app_first_name}
  onChange={e => set('app_first_name', e.target.value)}
  placeholder={t('settings.member_first_name_placeholder')}
/>
<input
  className="input"
  value={form.app_last_name}
  onChange={e => set('app_last_name', e.target.value)}
  placeholder={t('settings.member_last_name_placeholder')}
/>
```

- [ ] **Step 4: Add read-only eVault section**

After the ename input field (and only when editing an existing member that has ename set), add:

```jsx
{editing && form.ename && (
  <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--color-sand)', borderRadius: 8 }}>
    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-charcoal-light)', marginBottom: 8 }}>
      {t('settings.evault_identity')}
    </div>
    {editing.avatar_url && (
      <img
        src={editing.avatar_url}
        alt="avatar"
        style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', marginBottom: 8 }}
      />
    )}
    <div style={{ fontSize: '0.85rem', color: 'var(--color-charcoal)' }}>
      <strong>{t('settings.evault_ename')}:</strong> {form.ename}
    </div>
    {(editing.first_name || editing.last_name) && (
      <div style={{ fontSize: '0.85rem', color: 'var(--color-charcoal)', marginTop: 4 }}>
        <strong>{t('settings.evault_name')}:</strong> {[editing.first_name, editing.last_name].filter(Boolean).join(' ')}
      </div>
    )}
  </div>
)}
```

(`editing` here is the original member object being edited — make sure it's accessible in scope. Currently MembersModal likely has a selected member state.)

- [ ] **Step 5: Update save button disabled condition**

```jsx
disabled={saving || !form.app_first_name.trim() || !form.app_last_name.trim()}
```

- [ ] **Step 6: Update member list display**

In the member list (where members are displayed), replace `m.name` with:

```jsx
{[m.app_first_name, m.app_last_name].filter(Boolean).join(' ') || m.ename || '?'}
```

- [ ] **Step 7: Test in browser**

Start frontend: `cd ~/Projects/ALVer/app && npm run dev`

Open community settings → Members. Verify:
- Form shows app_first_name, app_last_name fields
- ename is optional (can save without it)
- Read-only eVault section appears when editing a member with ename
- Member list shows app names

- [ ] **Step 8: Commit**

```bash
cd ~/Projects/ALVer
git add app/src/components/MembersModal.jsx
git commit -m "feat: MembersModal — app_first_name/app_last_name fields, optional ename, eVault read-only section"
```

---

## Task 9: Frontend — Facilitate.jsx check-in by member_id

**Files:**
- Modify: `app/src/views/Facilitate.jsx`
- Modify: `app/src/context/MeetingContext.jsx`

The check-in modal already has a member picker. Currently it stores the selected `m.name` string and calls `checkIn(name, true)`. Change it to store `m.id` and call `manualAdd(member_id)`.

- [ ] **Step 1: Update MeetingContext — manualAdd API call**

In `api.manualAdd`, the current call sends `{ name }`. Update to send `{ member_id }`.

Find `api.manualAdd` in `app/src/lib/api.js` (or wherever the API helper lives):

```javascript
manualAdd: (meetingId, memberId, note) =>
  api.post(`/meetings/${meetingId}/attendees/manual`, { member_id: memberId, note }),
```

- [ ] **Step 2: Update MeetingContext — checkIn wrapper**

In MeetingContext, `checkIn(name, manual)` currently calls `api.manualAdd(meetingId, name)` when manual=true. Change:

```javascript
const manualCheckIn = async (memberId) => {
  try {
    await api.manualAdd(meetingId.current, memberId)
    // SSE will update the attendee list
  } catch (e) {
    console.error('Manual check-in failed', e)
  }
}
```

Expose `manualCheckIn` from context (add to the context value object).

- [ ] **Step 3: Update Facilitate.jsx — store member_id not name**

Change the check-in modal state:

```javascript
// Replace: const [selectedMember, setSelectedMember] = useState('')
const [selectedMemberId, setSelectedMemberId] = useState('')
const [memberSearch, setMemberSearch] = useState('')
```

Update `handleQuickCheckIn`:

```javascript
function handleQuickCheckIn() {
  if (selectedMemberId) {
    manualCheckIn(selectedMemberId)
    setSelectedMemberId('')
    setMemberSearch('')
    setShowCheckInModal(false)
  }
}
```

- [ ] **Step 4: Update the member picker list in Facilitate.jsx**

In the check-in modal, replace `m.name` references:

```jsx
// Display name:
const memberDisplayName = m => [m.app_first_name, m.app_last_name].filter(Boolean).join(' ') || m.ename || '?'

// Already-checked-in filter — compare by member_id instead of name:
.filter(m => !meeting.checkedIn.some(c => c.member_id === m.id))

// Search filter:
.filter(m => !memberSearch || memberDisplayName(m).toLowerCase().includes(memberSearch.toLowerCase()))

// Button:
<button
  key={m.id}
  onClick={() => setSelectedMemberId(m.id)}
  style={{ background: selectedMemberId === m.id ? 'rgba(196,98,45,0.08)' : 'white', ... }}
>
  <span>{memberDisplayName(m)}</span>
  {m.is_aspirant && <span className="aspirant-badge">...</span>}
</button>
```

Update button disabled:
```jsx
<button className="btn-primary" onClick={handleQuickCheckIn} disabled={!selectedMemberId}>
```

- [ ] **Step 5: Fix other m.name references in Facilitate.jsx**

Search for `m.name`, `c.name`, `attendee.name` in Facilitate.jsx and replace with computed display:

- Checked-in attendee list row: use `c.attendee_name` (the snapshot stored at check-in time — no change needed here)
- Member references: use `memberDisplayName(m)`

- [ ] **Step 6: Test in browser**

Open a meeting in facilitate view. Open the manual check-in modal. Verify:
- Members listed by app names
- Selecting and confirming checks person in
- Checked-in members disappear from picker list

- [ ] **Step 7: Commit**

```bash
cd ~/Projects/ALVer
git add app/src/views/Facilitate.jsx app/src/context/MeetingContext.jsx
git commit -m "feat: Facilitate manual check-in sends member_id; member picker uses app names"
```

---

## Task 10: Frontend — Home.jsx mandate by proxy member_id

**Files:**
- Modify: `app/src/views/Home.jsx`

The mandate form in Home.jsx lets a member give their mandate to a proxy. Currently sends `proxy_name`. Change to send `proxy_member_id`.

- [ ] **Step 1: Replace proxyName state with proxyMemberId**

```javascript
// Replace:
// const [proxyName, setProxyName] = useState('')
const [proxyMemberId, setProxyMemberId] = useState('')
```

- [ ] **Step 2: Update addMandate call**

```javascript
// In handleSubmitMandate:
await addMandate(proxyMemberId, mandateNote)
```

- [ ] **Step 3: Update addMandate in MeetingContext**

Change the `addMandate` function signature and API call:

```javascript
const addMandate = async (proxyMemberId, note = '') => {
  try {
    await api.addMandate(meetingId.current, { proxy_member_id: proxyMemberId, scope_note: note })
    // ...
  } catch (e) {
    // ...
  }
}
```

And the API helper `api.addMandate`:
```javascript
addMandate: (meetingId, data) =>
  api.post(`/meetings/${meetingId}/mandates`, data),
```

- [ ] **Step 4: Update proxy select in Home.jsx JSX**

```jsx
<select
  value={proxyMemberId}
  onChange={e => setProxyMemberId(e.target.value)}
>
  <option value="">{t('register.proxy_placeholder')}</option>
  {members
    .filter(m => m.id !== user?.member?.id)  // exclude self
    .map(m => (
      <option key={m.id} value={m.id}>
        {[m.app_first_name, m.app_last_name].filter(Boolean).join(' ') || m.ename || '?'}
      </option>
    ))
  }
</select>
```

- [ ] **Step 5: Update submit button disabled**

```jsx
disabled={!proxyMemberId || submitting}
```

- [ ] **Step 6: Reset on cancel**

```javascript
// Where mandate form is reset:
setProxyMemberId('')
```

- [ ] **Step 7: Test in browser**

Log in as a community member. Go to home screen with an open meeting. Select "Give mandate". Verify proxy dropdown shows member app names and submitting works.

- [ ] **Step 8: Commit**

```bash
cd ~/Projects/ALVer
git add app/src/views/Home.jsx app/src/context/MeetingContext.jsx
git commit -m "feat: Home.jsx mandate uses proxy_member_id; API updated"
```

---

## Task 11: Frontend — Attend.jsx self-check-in + display name cleanup

**Files:**
- Modify: `app/src/views/Attend.jsx`
- Modify: `app/src/context/MeetingContext.jsx`

- [ ] **Step 1: Update MeetingContext — W3DS self-checkIn**

Change the `checkIn` wrapper (for W3DS self-check-in, non-manual). The API endpoint `POST /attendees/checkin` now requires NO body — ename comes from JWT:

```javascript
const checkIn = async () => {
  try {
    await api.checkIn(meetingId.current)
  } catch (e) {
    console.error('Check-in failed', e)
  }
}
```

Update API helper:
```javascript
checkIn: (meetingId) =>
  api.post(`/meetings/${meetingId}/attendees/checkin`, {}),
```

- [ ] **Step 2: Update Attend.jsx — self-check-in trigger**

Find the effect that calls `checkIn(name)` (currently passes a name string). Remove the name argument:

```javascript
// Remove name resolution from member.name — just call checkIn()
if (!user || !meeting || checkedIn || checkInFired.current) return
checkInFired.current = true
checkIn()  // no name argument
```

- [ ] **Step 3: Update Attend.jsx — display name**

Replace `user.member?.name` with app names:

```javascript
// Replace:
// const name = user.member?.name || ...
const memberAppName = user.member
  ? [user.member.app_first_name, user.member.app_last_name].filter(Boolean).join(' ')
  : null
const displayName = memberAppName || user.displayName || user.ename || '?'
```

Update all places in Attend.jsx that use the old `name` variable to use `displayName`.

- [ ] **Step 4: Fix checkedIn detection in Attend.jsx**

The checked-in state detection currently uses name comparison:

```javascript
// Old:
c.name.toLowerCase() === name.toLowerCase()

// New — compare by ename (more reliable):
(user?.ename && c.ename && c.ename === user.ename)
```

Also fix mandate detection (same pattern).

- [ ] **Step 5: Type check frontend (if TypeScript)**

```bash
cd ~/Projects/ALVer/app && npx tsc --noEmit 2>/dev/null || echo "No TS in frontend"
```

- [ ] **Step 6: Test in browser**

Log in via W3DS (or dev-login). Navigate to an open meeting's attend page. Verify:
- Auto-check-in fires without needing name
- Display name shows app_first_name + app_last_name
- Meeting screen shows correct name

- [ ] **Step 7: Full integration smoke test**

Test the complete flow manually:
1. Facilitator creates meeting, opens it
2. Member 1 (W3DS): logs in → auto-checks in → casts vote ✓
3. Member 2 (no ename): facilitator manually checks in → facilitator casts vote on behalf ✓
4. Member 1 gives mandate to Member 2: Home.jsx mandate form ✓
5. Check facilitator view shows correct app names throughout ✓

- [ ] **Step 8: Commit**

```bash
cd ~/Projects/ALVer
git add app/src/views/Attend.jsx app/src/context/MeetingContext.jsx
git commit -m "feat: Attend.jsx W3DS self-check-in requires no name; display uses app names"
```

---

## Post-implementation notes

**What is NOT in this plan (separate future plan):**
- Drop `name` column from `members` table (requires confirming zero code references remain)
- Drop `users` table + `User` entity + `UserService`
- Change JWT to `{ ename }` only (remove `userId`)
- Remove `preRegister` endpoint if unused

**Data migration (manual, no code):**
- Facilitator opens Members form for each person without ename and assigns their W3DS identity
- No automated name-matching — too risky

**i18n keys referenced but not added:**
- `settings.evault_identity`
- `settings.evault_ename`
- `settings.evault_name`
Add these to all locale files (`app/src/i18n/*.json`).
