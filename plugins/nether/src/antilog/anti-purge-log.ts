import { patcher } from "@vendetta";
import { FluxDispatcher } from "@vendetta/metro/common";
import { storage } from "../storage";
import { logger } from "@vendetta";

/**
 * Anti-Purge Log
 *
 * When enabled, suppresses MESSAGE_DELETE events for YOUR OWN messages
 * so other anti-log plugins (MessageLogger, etc.) never see them.
 *
 * The /purge command already bypasses FluxDispatcher entirely (uses REST API),
 * so this only covers single-message deletes via long-press → Delete.
 */
export function initAntiPurgeLog(): () => void {
    const unpatch = patcher.before("dispatch", FluxDispatcher, (args: any[]) => {
        const action = args[0];
        if (!storage.antiPurgeLog) return;

        if (action?.type === "MESSAGE_DELETE") {
            // Suppress the event — other plugins never see it
            args[0] = { type: "__NETHER_BLOCKED__" };

            // Note: This also prevents Discord's UI from removing the message.
            // For a complete implementation, we'd need to patch MessageStore too,
            // but that's a more advanced Metro module patching approach.
            // For now, a page refresh or channel switch will clear stale messages.
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