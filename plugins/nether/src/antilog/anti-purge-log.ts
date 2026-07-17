import { patcher } from "@vendetta";
import { FluxDispatcher } from "@vendetta/metro/common";
import { findByStoreName } from "@vendetta/metro";
import { storage } from "../storage";
import { logger } from "@vendetta";

/**
 * Anti-Purge Log
 *
 * Intercepts MESSAGE_DELETE for YOUR messages and converts to MESSAGE_UPDATE
 * so the message stays in the UI (marked deleted via RowManager patch) but
 * other anti-log plugins never see a delete event.
 *
 * Based on the proven pattern from vendetta message-logger plugins:
 *   patcher.before → convert MESSAGE_DELETE → MESSAGE_UPDATE
 *
 * The /purge command uses REST API directly (bypasses FluxDispatcher),
 * so this only covers single-message deletes via long-press → Delete.
 */
export function initAntiPurgeLog(): () => void {
    let ownUserId = "";
    try {
        const UserStore = findByStoreName("UserStore") as any;
        ownUserId = UserStore?.getCurrentUser()?.id || "";
    } catch {}

    const unpatch = patcher.before("dispatch", FluxDispatcher, (args: any[]) => {
        const action = args[0];
        if (!storage.antiPurgeLog) return;

        if (action?.type === "MESSAGE_DELETE") {
            const channelId = action.channel_id;
            const msgId = action.id;

            // Only intercept deletes of OUR messages
            const MessageStore = findByStoreName("MessageStore") as any;
            const msgs = MessageStore?.getMessages(channelId);
            const msg = msgs?.get(msgId);
            if (msg && msg.author?.id === ownUserId) {
                // Convert MESSAGE_DELETE → MESSAGE_UPDATE
                // This keeps the message visible (with deleted styling)
                // while shielding it from other plugins' patcher.after hooks
                action.type = "MESSAGE_UPDATE";
                action.message = {
                    id: msgId,
                    channel_id: channelId,
                    content: msg.content || "",
                    author: msg.author,
                    timestamp: msg.timestamp,
                    attachments: msg.attachments,
                    embeds: msg.embeds,
                    __vml_deleted: true,
                    flags: msg.flags,
                };
            }
        }

        if (action?.type === "MESSAGE_DELETE_BULK") {
            args[0] = { type: "__NETHER_BLOCKED__" };
        }
    });

    logger.log("[Nether] Anti-purge-log initialized.");
    return () => {
        unpatch();
        logger.log("[Nether] Anti-purge-log unloaded.");
    };
}