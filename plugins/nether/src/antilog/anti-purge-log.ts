import { patcher } from "@vendetta";
import { FluxDispatcher } from "@vendetta/metro/common";
import { findByStoreName } from "@vendetta/metro";
import { storage } from "../storage";
import { discordApi } from "../utils";
import { logger } from "@vendetta";

/**
 * Anti-Purge Log
 *
 * When you delete a message, this edits the message to dummy/block text
 * FIRST, THEN dispatches the real MESSAGE_DELETE so other clients'
 * message loggers only capture the dummy content.
 *
 * Flow:
 *   patcher.before("dispatch") intercepts MESSAGE_DELETE
 *   → Suppresses the original event
 *   → Edits the message to dummy text via REST API
 *   → Dispatches a new MESSAGE_DELETE with the real ID
 *   → Other clients' loggers see the dummy content in their cache
 *
 * CRITICAL: Uses a Set-based reentrancy guard (_netherAntiPurgeIds) to prevent
 * the infinite loop that would occur when our own FluxDispatcher.dispatch()
 * call re-enters this same patcher.before handler.
 */

let ownUserId = "";
const handlingIds = new Set<string>();

export function initAntiPurgeLog(): () => void {
    try {
        const UserStore = findByStoreName("UserStore") as any;
        ownUserId = UserStore?.getCurrentUser()?.id || "";
    } catch {}

    const unpatch = patcher.before("dispatch", FluxDispatcher, async (args: any[]) => {
        const action = args[0];
        if (!storage.antiPurgeLog) return;

        if (action?.type === "MESSAGE_DELETE") {
            const channelId = action.channel_id;
            const msgId = action.id;
            if (!channelId || !msgId) return;

            // Reentrancy guard: if we're already handling this message ID,
            // let this dispatch through — it's the one WE triggered after the edit.
            const key = `${channelId}:${msgId}`;
            if (handlingIds.has(key)) {
                handlingIds.delete(key);
                return;
            }

            const MessageStore = findByStoreName("MessageStore") as any;
            const msgs = MessageStore?.getMessages(channelId);
            const msg = msgs?.get(msgId);
            if (!msg || msg.author?.id !== ownUserId) return;

            // Suppress the original delete event
            args[0] = { type: "__NETHER_BLOCKED__" };

            const blockText = storage.antiPurgeLogMessage || "‎";

            try {
                // Edit to dummy text first — this propagates to other clients
                // and their message loggers cache this instead of the original
                await discordApi("PATCH", `/channels/${channelId}/messages/${msgId}`, {
                    content: blockText,
                });

                // Mark this ID so the re-dispatched MESSAGE_DELETE is not intercepted
                handlingIds.add(key);

                // Now dispatch the real delete — content is already overwritten
                FluxDispatcher.dispatch({
                    type: "MESSAGE_DELETE",
                    id: msgId,
                    channel_id: channelId,
                });
            } catch (e: any) {
                // Edit failed (too old, no permission) — just let delete go through
                logger.error("[Nether] Anti-purge edit failed:", e.message);
                handlingIds.add(key);
                FluxDispatcher.dispatch({
                    type: "MESSAGE_DELETE",
                    id: msgId,
                    channel_id: channelId,
                });
            }
        }
    });

    logger.log("[Nether] Anti-purge-log initialized.");
    return () => {
        unpatch();
        handlingIds.clear();
        logger.log("[Nether] Anti-purge-log unloaded.");
    };
}