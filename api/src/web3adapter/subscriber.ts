/**
 * W3DS Sync Subscriber — STUB
 *
 * In the eCurrency/eVoting pattern this is a TypeORM EntitySubscriber
 * that listens to afterInsert/afterUpdate events and calls the Web3Adapter
 * to sync changes to the eVault (with a 3-second debounce and lockedIds
 * loop prevention).
 *
 * This stub establishes the seam. Implementation follows in the
 * W3DS integration phase.
 *
 * Pattern to follow (from eCurrency):
 *
 *   @EventSubscriber()
 *   export class AlverSubscriber implements EntitySubscriberInterface {
 *     async afterInsert(event: InsertEvent<any>) {
 *       setTimeout(async () => {
 *         const globalId = await adapter.mappingDb.getGlobalId(entity.id);
 *         if (adapter.lockedIds.includes(globalId)) return;
 *         await adapter.handleChange({ data, tableName });
 *       }, 3_000);
 *     }
 *   }
 */

export {};
