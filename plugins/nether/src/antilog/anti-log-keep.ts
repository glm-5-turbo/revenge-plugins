import { patcher } from "@vendetta";
import { FluxDispatcher } from "@vendetta/metro/common";
import { findByStoreName } from "@vendetta/metro";
import { storage } from "../storage";
import { showToast } from "@vendetta/ui/toasts";
import { logger } from "@vendetta";

/**
 * Anti-Log: Keep Deleted Messages Visible Locally
 *
 * Pattern C from the research:
 *   - Intercepts MESSAGE_DELETE / MESSAGE_DELETE_BULK for YOUR own messages
 *   - Blocks them from reaching MessageStore so they remain in the visible chat
 *   - Marks the message with __vml_deleted so the renderer can badge it
 *   - Persists content to MMKV (via @vendetta/plugin.storage) so it survives reloads
 *   - On plugin load, re-injects any cached ghosts that are missing from MessageStore
 *
 * IMPORTANT: This is CLIENT-LOCAL ONLY. The Discord server still removes the message.
 * Other users in the channel see the deletion as normal. Only YOUR client shows the ghost.
 *
 * Interaction with anti-anti-log: When OTHER users use anti-log, they suppress MESSAGE_DELETE
 * on their own client. We still receive the gateway MESSAGE_DELETE event on OUR client, so
 * this feature works regardless of what other users have enabled. It only fails if Discord
 * itself doesn't broadcast the deletion, which doesn't happen.
 */

let ownUserId = "";
const injected = new Set<string>();

export function initAntiLogKeep(): () => void {
    try {
        const UserStore = findByStoreName("UserStore") as any;
        ownUserId = UserStore?.getCurrentUser()?.id || "";
    } catch {}

    let handlingBulk = false;

    const unpatchDelete = patcher.before("dispatch", FluxDispatcher, (args: any[]) => {
        if (!storage.antiLogKeepDeleted) return;
        const action = args[0];
        if (!action) return;
        // Reentrancy guard for re-dispatched events
        if (action.type === "__NETHER_GHOST_BLOCKED__") return;

        const isDelete = action.type === "MESSAGE_DELETE";
        const isBulk = action.type === "MESSAGE_DELETE_BULK";
        if (!isDelete && !isBulk) return;

        const channelId = action.channel_id ?? action.channelId;
        const ids = isDelete ? [action.id] : (action.ids || []);
        if (!channelId || !ids?.length) return;

        const MessageStore = findByStoreName("MessageStore") as any;
        if (!MessageStore?.getMessages) return;
        const store = MessageStore.getMessages(channelId);

        let blocked = 0;
        const blockedIds: string[] = [];
        const passThroughIds: string[] = [];

        for (const id of ids) {
            const msg = store?.get(id);
            if (!msg || msg.author?.id !== ownUserId) {
                passThroughIds.push(id);
                continue;
            }

            // Cache content in MMKV so it survives reloads
            if (!storage.ghostCache) storage.ghostCache = {};
            const key = `${channelId}:${id}`;
            storage.ghostCache[key] = {
                id,
                channel_id: channelId,
                content: msg.content,
                author: msg.author,
                timestamp: msg.timestamp,
                ghostedAt: Date.now(),
            };

            // Mark on the live message so the renderer can badge it
            msg.__vml_deleted = true;
            msg.edited = "deleted (kept)";

            injected.add(key);
            blocked++;
            blockedIds.push(id);
        }

        if (blocked > 0) {
            showToast(`👻 Anti-log kept ${blocked} deleted message${blocked === 1 ? "" : "s"} locally`);

            if (isDelete) {
                // Single delete: just block the dispatch
                args[0] = { type: "__NETHER_GHOST_BLOCKED__" };
            } else if (isBulk && passThroughIds.length > 0) {
                // Bulk delete with mixed messages: split into two dispatches.
                // Block our own messages but let others' deletions through.
                args[0] = { type: "__NETHER_GHOST_BLOCKED__" };
                if (!handlingBulk) {
                    handlingBulk = true;
                    // Re-dispatch with only the non-own IDs so other users' messages
                    // actually get removed from the UI
                    setTimeout(() => {
                        FluxDispatcher.dispatch({
                            type: "MESSAGE_DELETE_BULK",
                            ids: passThroughIds,
                            channel_id: channelId,
                        });
                        handlingBulk = false;
                    }, 50);
                }
            } else {
                // All messages are ours — just block
                args[0] = { type: "__NETHER_GHOST_BLOCKED__" };
            }
        }
    });

    // Re-inject any cached ghosts that are missing from the live store
    // (runs after plugin load, catches messages deleted while plugin was off)
    rehydrateGhosts();

    logger.log("[Nether] Anti-log keep initialized.");
    return () => {
        unpatchDelete();
        injected.clear();
        logger.log("[Nether] Anti-log keep unloaded.");
    };
}

function rehydrateGhosts(): void {
    if (!storage.antiLogKeepDeleted || !storage.ghostCache) return;
    const cache = storage.ghostCache as Record<string, any>;
    const MessageStore = findByStoreName("MessageStore") as any;
    if (!MessageStore?.getMessages) return;

    for (const key of Object.keys(cache)) {
        const ghost = cache[key];
        const store = MessageStore.getMessages(ghost.channel_id);
        if (!store) continue;
        const existing = store.get(ghost.id);
        // Only inject if missing from the store
        if (existing) {
            existing.__vml_deleted = true;
            existing.edited = "deleted (kept)";
            continue;
        }
        try {
            FluxDispatcher.dispatch({
                type: "MESSAGE_CREATE",
                message: {
                    ...ghost,
                    __vml_deleted: true,
                    edited: "deleted (kept)",
                    // Mark so listeners can tell it's a rehydrated ghost
                    _nether_ghost: true,
                },
            });
        } catch (e) {
            logger.error("[Nether] Ghost rehydrate failed:", e);
        }
    }
}