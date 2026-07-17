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

// ── eVault rate limiter + retry ───────────────────────────────────────────────
const MAX_CONCURRENT_EVAULT_OPS = 3;
let _activeOps = 0;
const _waitQueue: Array<() => void> = [];

function acquireSemaphore(): Promise<void> {
    return new Promise(resolve => {
        if (_activeOps < MAX_CONCURRENT_EVAULT_OPS) { _activeOps++; resolve(); }
        else _waitQueue.push(() => { _activeOps++; resolve(); });
    });
}
function releaseSemaphore(): void {
    _activeOps--;
    const next = _waitQueue.shift();
    if (next) next();
}

async function withEvaultRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
    await acquireSemaphore();
    try {
        const MAX_RETRIES = 3;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                return await fn();
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                // Auth / not-found errors won't succeed on retry — bail immediately
                if (msg.includes("401") || msg.includes("403") || msg.includes("404")) throw err;
                if (attempt === MAX_RETRIES) throw err;
                // Rate-limit: use 30 s fixed delay (Retry-After header not exposed through adapter)
                const isRateLimit = msg.includes("429") || msg.toLowerCase().includes("too many");
                const delay = isRateLimit ? 30_000 : 1000 * 2 ** (attempt - 1);
                console.warn(`[W3DS] ${context} attempt ${attempt} failed${isRateLimit ? " (rate-limited)" : ""}, retrying in ${delay}ms`);
                await new Promise(r => setTimeout(r, delay));
            }
        }
        throw new Error("unreachable");
    } finally {
        releaseSemaphore();
    }
}

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

// Tables that are imported read-only from eVault and must never be synced back outbound.
const READ_ONLY_TABLES = new Set(["communities"]);

@EventSubscriber()
export class AlverSubscriber implements EntitySubscriberInterface {

    async afterInsert(event: InsertEvent<any>) {
        const entityId = event.entity?.id;
        const tableName = event.metadata.tableName;
        const entityTarget = event.metadata.target;
        if (!entityId) return;

        const parentTrigger = PARENT_TRIGGER_MAP[tableName];
        // Read-only tables are never pushed outbound from ALVer.
        if (!parentTrigger && READ_ONLY_TABLES.has(tableName)) return;

        setTimeout(async () => {
            try {
                if (parentTrigger) {
                    await withEvaultRetry(
                        () => this.syncParent(event.entity, parentTrigger),
                        `syncParent(insert ${tableName})`
                    );
                } else {
                    const globalId = await adapter.mappingDb.getGlobalId(entityId) ?? "";
                    if (adapter.lockedIds.includes(globalId) || adapter.lockedIds.includes(entityId)) return;

                    const enriched = await this.loadAndEnrich(entityId, tableName, entityTarget);
                    if (!enriched) return;

                    await withEvaultRetry(
                        () => adapter.handleChange({ data: enriched, tableName }),
                        `handleChange(insert ${tableName})`
                    );
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
        // Read-only tables are never pushed outbound from ALVer.
        if (!parentTrigger && READ_ONLY_TABLES.has(tableName)) return;

        setTimeout(async () => {
            try {
                if (parentTrigger) {
                    // Reload the child to get FK — event.entity is often partial on updates
                    const repo = AppDataSource.getRepository(entityTarget);
                    const child = await repo.findOne({ where: { id: entityId } });
                    if (!child) return;
                    await withEvaultRetry(
                        () => this.syncParent(child, parentTrigger),
                        `syncParent(update ${tableName})`
                    );
                } else {
                    const globalId = await adapter.mappingDb.getGlobalId(entityId) ?? "";
                    if (adapter.lockedIds.includes(globalId) || adapter.lockedIds.includes(entityId)) return;

                    const enriched = await this.loadAndEnrich(entityId, tableName, entityTarget);
                    if (!enriched) return;

                    await withEvaultRetry(
                        () => adapter.handleChange({ data: enriched, tableName }),
                        `handleChange(update ${tableName})`
                    );
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
        if (!entityForSync) return;
        // Read-only tables are never pushed outbound from ALVer.
        if (!parentTrigger && READ_ONLY_TABLES.has(tableName)) return;

        if (parentTrigger) {
            setTimeout(async () => {
                try {
                    await withEvaultRetry(
                        () => this.syncParent(entityForSync, parentTrigger),
                        `syncParent(remove ${tableName})`
                    );
                } catch (err) {
                    console.error(`[W3DS] Sync failed (remove) for ${tableName}:`, err);
                }
            }, 3_000);
        } else {
            // Top-level entity deleted: remove its eVault envelope.
            // eVault is source of truth — failures must be loud, not silent.
            const entityId = entityForSync.id;
            if (!entityId) return;

            setTimeout(async () => {
                try {
                    const globalId = await adapter.mappingDb.getGlobalId(entityId);
                    if (!globalId) return; // never synced to eVault

                    const ownerEname = await this.resolveOwnerEname(tableName, entityForSync);
                    if (!ownerEname) {
                        console.warn(`[W3DS] Cannot resolve owner ename for ${tableName} ${entityId} — skipping eVault delete`);
                        return;
                    }

                    await withEvaultRetry(
                        () => this.removeEnvelopeFromEvault(ownerEname, globalId),
                        `removeEnvelope(${tableName})`
                    );
                    console.log(`[W3DS] Deleted eVault envelope ${globalId} for ${tableName} ${entityId}`);
                } catch (err) {
                    console.error(`[W3DS] eVault delete failed for ${tableName} ${entityId}:`, err);
                    throw err;
                }
            }, 0);
        }
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
        // Skip outbound eVault sync for read-only parent tables (e.g. communities).
        if (!READ_ONLY_TABLES.has(trigger.parentTable)) {
            await adapter.handleChange({ data: enriched, tableName: trigger.parentTable });
        }

        // Gap 6: Reference fan-out — when a member with an ename is added/updated,
        // write a reference envelope on their vault so they can discover the community.
        if (trigger.parentTable === "communities" && childEntity.ename) {
            const memberEname: string = childEntity.ename;
            const communityW3id: string | undefined = parent.ename;
            const communityEnvelopeId = await adapter.mappingDb.getGlobalId(parentId);
            if (communityW3id && communityEnvelopeId) {
                const normalizedMemberEname = memberEname.startsWith("@") ? memberEname : `@${memberEname}`;
                try {
                    await adapter.evaultClient.storeReference(
                        `${communityW3id}/${communityEnvelopeId}`,
                        memberEname,
                        [normalizedMemberEname]   // member-only ACL — matches Meshenger pattern
                    );
                } catch (err) {
                    console.warn(`[W3DS] Reference fan-out failed for member ${memberEname}:`, err);
                }
            }
        }
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
                break;
            }
            case "polls": {
                plain.options      = (plain.vote_options ?? []).map((o: any) => o.label);
                plain.mode         = "normal";
                plain.votingWeight = "1p1v";
                break;
            }
            case "votes": {
                plain.data = { mode: "normal", options: [plain.option_id] };
                break;
            }
        }
        return plain;
    }

    // Resolves the owner eVault ename for a top-level entity based on its FK fields.
    private async resolveOwnerEname(tableName: string, entity: any): Promise<string | null> {
        switch (tableName) {
            case "communities":
                return entity.ename ?? null;
            case "meetings": {
                if (!entity.community_id) return null;
                const community = await AppDataSource.getRepository("Community")
                    .findOne({ where: { id: entity.community_id } });
                return (community as any)?.ename ?? null;
            }
            case "polls": {
                if (!entity.meeting_id) return null;
                const meeting = await AppDataSource.getRepository("Meeting")
                    .findOne({ where: { id: entity.meeting_id }, relations: ["community"] });
                return (meeting as any)?.community?.ename ?? null;
            }
            case "votes": {
                if (!entity.poll_id) return null;
                const poll = await AppDataSource.getRepository("Poll")
                    .findOne({ where: { id: entity.poll_id }, relations: ["meeting", "meeting.community"] });
                return (poll as any)?.meeting?.community?.ename ?? null;
            }
            default:
                return null;
        }
    }

    // Direct GraphQL delete — the Web3 Adapter's evaultClient has no removeEnvelope method.
    // Uses DEVELOPER_API_KEY (static, no per-request token exchange needed).
    private async removeEnvelopeFromEvault(ownerEname: string, envelopeId: string): Promise<void> {
        const registryUrl = process.env.PUBLIC_REGISTRY_URL!;
        const developerApiKey = process.env.DEVELOPER_API_KEY ?? "";
        const normalized = ownerEname.startsWith("@") ? ownerEname : `@${ownerEname}`;

        const resolveRes = await fetch(`${registryUrl}/resolve?w3id=${encodeURIComponent(normalized)}`);
        if (!resolveRes.ok) throw new Error(`Registry resolve failed for ${normalized}: ${resolveRes.status}`);
        const { uri } = await resolveRes.json() as { uri: string };

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "X-ENAME": normalized,
        };
        if (developerApiKey) headers["Authorization"] = `Bearer ${developerApiKey}`;

        const res = await fetch(new URL("/graphql", uri).toString(), {
            method: "POST",
            headers,
            body: JSON.stringify({
                query: `mutation RemoveMetaEnvelope($id: ID!) {
                    removeMetaEnvelope(id: $id) {
                        deletedId success errors { message code }
                    }
                }`,
                variables: { id: envelopeId },
            }),
        });
        if (!res.ok) throw new Error(`eVault delete HTTP ${res.status} for ${envelopeId}`);
        const result = await res.json() as any;
        const op = result?.data?.removeMetaEnvelope;
        if (!op?.success) {
            const msg = op?.errors?.[0]?.message ?? "unknown";
            throw new Error(`removeMetaEnvelope failed: ${msg}`);
        }
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
