import {
    EventSubscriber,
    EntitySubscriberInterface,
    InsertEvent,
    UpdateEvent,
    RemoveEvent,
} from "typeorm";
import { Web3Adapter } from "web3-adapter";
import path from "path";
import dotenv from "dotenv";
import { AppDataSource } from "../database/data-source";

dotenv.config({ path: path.resolve(__dirname, "../../../.env"), override: true });

export const adapter = new Web3Adapter({
    schemasPath: path.resolve(__dirname, "../../mappings/"),
    dbPath: path.resolve(process.env.ALVER_MAPPING_DB_PATH as string),
    registryUrl: process.env.PUBLIC_REGISTRY_URL as string,
    platform: process.env.VITE_PUBLIC_ALVER_BASE_URL as string,
});

// Child entities that trigger a parent re-sync instead of syncing themselves.
// Attendees + Mandates are embedded in the Meeting CalendarEvent envelope.
// Decisions are embedded in the Poll envelope.
// Members trigger a Community GroupManifest re-sync when ename is linked.
const PARENT_TRIGGER_MAP: Record<string, {
    parentTable: string;
    parentEntity: string;
    fk: string;
}> = {
    attendees: { parentTable: "meetings",    parentEntity: "Meeting",   fk: "meeting_id"   },
    mandates:  { parentTable: "meetings",    parentEntity: "Meeting",   fk: "meeting_id"   },
    decisions: { parentTable: "polls",       parentEntity: "Poll",      fk: "poll_id"      },
    members:   { parentTable: "communities", parentEntity: "Community", fk: "community_id" },
};

@EventSubscriber()
export class AlverSubscriber implements EntitySubscriberInterface {

    async afterInsert(event: InsertEvent<any>) {
        const entityId = event.entity?.id;
        const tableName = event.metadata.tableName;
        const entityTarget = event.metadata.target;
        if (!entityId) return;

        const parentTrigger = PARENT_TRIGGER_MAP[tableName];

        setTimeout(async () => {
            try {
                if (parentTrigger) {
                    await this.syncParent(event.entity, parentTrigger);
                } else {
                    const globalId = await adapter.mappingDb.getGlobalId(entityId) ?? "";
                    if (adapter.lockedIds.includes(globalId) || adapter.lockedIds.includes(entityId)) return;

                    const enriched = await this.loadAndEnrich(entityId, tableName, entityTarget);
                    if (!enriched) return;

                    await adapter.handleChange({ data: enriched, tableName });
                }
            } catch (err) {
                console.error(`[W3DS] Sync failed (insert) for ${tableName}:`, err);
            }
        }, 3_000);
    }

    async afterUpdate(event: UpdateEvent<any>) {
        const entityId = event.entity?.id ?? event.databaseEntity?.id;
        const tableName = event.metadata.tableName;
        const entityTarget = event.metadata.target;
        if (!entityId) return;

        const parentTrigger = PARENT_TRIGGER_MAP[tableName];

        setTimeout(async () => {
            try {
                if (parentTrigger) {
                    // Reload the child to get FK — event.entity is often partial on updates
                    const repo = AppDataSource.getRepository(entityTarget);
                    const child = await repo.findOne({ where: { id: entityId } });
                    if (!child) return;
                    await this.syncParent(child, parentTrigger);
                } else {
                    const globalId = await adapter.mappingDb.getGlobalId(entityId) ?? "";
                    if (adapter.lockedIds.includes(globalId) || adapter.lockedIds.includes(entityId)) return;

                    const enriched = await this.loadAndEnrich(entityId, tableName, entityTarget);
                    if (!enriched) return;

                    await adapter.handleChange({ data: enriched, tableName });
                }
            } catch (err) {
                console.error(`[W3DS] Sync failed (update) for ${tableName}:`, err);
            }
        }, 3_000);
    }

    async afterRemove(event: RemoveEvent<any>) {
        const tableName = event.metadata.tableName;
        const parentTrigger = PARENT_TRIGGER_MAP[tableName];
        // databaseEntity is always populated by TypeORM; entity may be undefined
        // for cascade-triggered removes where no instance was loaded.
        const entityForSync = event.entity ?? event.databaseEntity;
        if (!parentTrigger || !entityForSync) return;

        setTimeout(async () => {
            try {
                await this.syncParent(entityForSync, parentTrigger);
            } catch (err) {
                console.error(`[W3DS] Sync failed (remove) for ${tableName}:`, err);
            }
        }, 3_000);
    }

    // Loads a parent entity and re-syncs it when a child entity changes.
    private async syncParent(
        childEntity: any,
        trigger: { parentTable: string; parentEntity: string; fk: string }
    ): Promise<void> {
        const parentId = childEntity?.[trigger.fk];
        if (!parentId) return;

        const globalId = await adapter.mappingDb.getGlobalId(parentId) ?? "";
        if (adapter.lockedIds.includes(globalId) || adapter.lockedIds.includes(parentId)) return;

        const repo = AppDataSource.getRepository(trigger.parentEntity);
        const parent = await repo.findOne({
            where: { id: parentId },
            relations: this.getRelations(trigger.parentTable),
        });
        if (!parent) return;

        const plain = this.toPlain(parent);
        const enriched = await this.enrichEntity(plain, trigger.parentTable);
        await adapter.handleChange({ data: enriched, tableName: trigger.parentTable });
    }

    // Reloads entity from DB with all relations, then enriches with computed fields.
    private async loadAndEnrich(id: string, tableName: string, entityTarget: any): Promise<any | null> {
        try {
            const repo = AppDataSource.getRepository(entityTarget);
            const full = await repo.findOne({
                where: { id },
                relations: this.getRelations(tableName),
            });
            if (!full) return null;

            const plain = this.toPlain(full);
            return await this.enrichEntity(plain, tableName);
        } catch (err) {
            console.error(`[W3DS] loadAndEnrich failed for ${tableName}:`, err);
            return null;
        }
    }

    // Relations needed to traverse ownerEnamePath and load embedded child data.
    private getRelations(tableName: string): string[] {
        switch (tableName) {
            case "communities": return ["members"];
            case "meetings":    return ["community", "attendees", "mandates"];
            case "polls":       return ["meeting", "meeting.community"];
            case "votes":       return ["poll", "poll.meeting", "poll.meeting.community"];
            default:            return [];
        }
    }

    // Adds computed fields to the plain entity before eVault sync.
    private async enrichEntity(plain: Record<string, any>, tableName: string): Promise<Record<string, any>> {
        switch (tableName) {
            case "communities": {
                plain.admins = plain.facilitator_ename ? [plain.facilitator_ename] : [];
                plain.members = (plain.members ?? [])
                    .filter((m: any) => m.ename)
                    .map((m: any) => m.ename);
                break;
            }
            case "meetings": {
                plain.startDateTime = `${plain.date}T${plain.time}:00`;
                plain.endDateTime   = plain.end_time
                    ? `${plain.date}T${plain.end_time}:00`
                    : plain.startDateTime;
                plain.attendees = (plain.attendees ?? []).map((a: any) => ({
                    name:        a.attendee_name,
                    ename:       a.attendee_ename ?? null,
                    status:      a.status,
                    checkedInAt: a.checked_in_at ?? null,
                    method:      a.method,
                    isAspirant:  a.is_aspirant ?? false,
                }));
                plain.mandates = (plain.mandates ?? []).map((m: any) => ({
                    granterName:  m.granter_name,
                    granterEname: m.granter_ename ?? null,
                    proxyName:    m.proxy_name,
                    proxyEname:   m.proxy_ename ?? null,
                    scopeNote:    m.scope_note ?? null,
                    status:       m.status,
                    grantedAt:    m.granted_at ?? null,
                    revokedAt:    m.revoked_at ?? null,
                }));
                break;
            }
            case "polls": {
                plain.options      = (plain.vote_options ?? []).map((o: any) => o.label);
                plain.mode         = "normal";
                plain.votingWeight = "1p1v";
                // String-based repository lookup avoids circular import (Decision → Poll → Meeting).
                const decision = await AppDataSource.getRepository("Decision").findOne({
                    where: { poll_id: plain.id },
                } as any) as any;
                plain.decision = decision ? {
                    result:               decision.result,
                    breakdown:            decision.breakdown,
                    totalVotes:           decision.total_votes,
                    closedAt:             decision.closed_at instanceof Date
                        ? decision.closed_at.toISOString()
                        : decision.closed_at,
                    facilitatorSignature: decision.facilitator_signature ?? null,
                } : null;
                break;
            }
            case "votes": {
                plain.data = { mode: "normal", data: [plain.option_id] };
                break;
            }
        }
        return plain;
    }

    private toPlain(entity: any): any {
        if (!entity || typeof entity !== "object") return entity;
        if (entity instanceof Date) return entity.toISOString();
        if (Array.isArray(entity)) return entity.map(i => this.toPlain(i));
        const plain: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(entity)) {
            if (k.startsWith("_")) continue;
            plain[k] = v instanceof Date ? v.toISOString()
                : Array.isArray(v) ? v.map(i => this.toPlain(i))
                : v && typeof v === "object" ? this.toPlain(v)
                : v;
        }
        return plain;
    }
}
