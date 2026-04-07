import {
    EventSubscriber,
    EntitySubscriberInterface,
    InsertEvent,
    UpdateEvent,
} from "typeorm";
import { Web3Adapter } from "web3-adapter";
import path from "path";
import dotenv from "dotenv";
import { AppDataSource } from "../database/data-source";
import { Meeting } from "../database/entities/Meeting";

dotenv.config({ path: path.resolve(__dirname, "../../../.env"), override: true });

export const adapter = new Web3Adapter({
    schemasPath: path.resolve(__dirname, "../../mappings/"),
    dbPath: path.resolve(process.env.ALVER_MAPPING_DB_PATH as string),
    registryUrl: process.env.PUBLIC_REGISTRY_URL as string,
    platform: process.env.VITE_PUBLIC_ALVER_BASE_URL as string,
});

@EventSubscriber()
export class AlverSubscriber implements EntitySubscriberInterface {

    async afterInsert(event: InsertEvent<any>) {
        const entityId = event.entity?.id;
        const tableName = event.metadata.tableName;
        const entityTarget = event.metadata.target;
        if (!entityId) return;

        setTimeout(async () => {
            try {
                const globalId = await adapter.mappingDb.getGlobalId(entityId) ?? "";
                if (adapter.lockedIds.includes(globalId) || adapter.lockedIds.includes(entityId)) return;

                const enriched = await this.loadAndEnrich(entityId, tableName, entityTarget);
                if (!enriched) return;

                await adapter.handleChange({ data: enriched, tableName });
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

        setTimeout(async () => {
            try {
                const globalId = await adapter.mappingDb.getGlobalId(entityId) ?? "";
                if (adapter.lockedIds.includes(globalId) || adapter.lockedIds.includes(entityId)) return;

                const enriched = await this.loadAndEnrich(entityId, tableName, entityTarget);
                if (!enriched) return;

                await adapter.handleChange({ data: enriched, tableName });
            } catch (err) {
                console.error(`[W3DS] Sync failed (update) for ${tableName}:`, err);
            }
        }, 3_000);
    }

    // Re-fetch the entity fresh from DB with all relations needed to resolve ownerEnamePath.
    // Must be called inside the 3-sec setTimeout — event-time entity state may be partial.
    // entityTarget is the TypeORM entity class (from event.metadata.target) — required for
    // getRepository; do NOT pass the table name string, it won't work.
    private async loadAndEnrich(id: string, tableName: string, entityTarget: any): Promise<any | null> {
        try {
            const repo = AppDataSource.getRepository(entityTarget);
            const full = await repo.findOne({
                where: { id },
                relations: this.getRelations(tableName),
            });
            if (!full) return null;

            // Decision has no TypeORM @ManyToOne meeting relation — load it manually.
            if (tableName === "decisions") {
                const meeting = await AppDataSource.getRepository(Meeting).findOne({
                    where: { id: full.meeting_id },
                    relations: ["community"],
                });
                if (meeting) full.meeting = meeting;
            }

            return this.toPlain(full);
        } catch (err) {
            console.error(`[W3DS] loadAndEnrich failed for ${tableName}:`, err);
            return null;
        }
    }

    // Relations required to traverse ownerEnamePath for each table.
    private getRelations(tableName: string): string[] {
        switch (tableName) {
            case "meetings":    return ["community"];
            case "attendees":   return ["meeting", "meeting.community"];
            case "polls":       return ["meeting", "meeting.community"];
            case "votes":       return ["poll", "poll.meeting", "poll.meeting.community"];
            case "decisions":   return [];   // meeting loaded manually above
            default:            return [];
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
