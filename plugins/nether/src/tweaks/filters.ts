import { patcher } from "@vendetta";
import { FluxDispatcher } from "@vendetta/metro/common";
import { storage } from "../storage";
import { getOwnUserId } from "../utils";
import { logger } from "@vendetta";

/**
 * Bot filter — suppresses bot messages from the chat view when enabled.
 * Uses patcher.before on FluxDispatcher.dispatch to swallow
 * MESSAGE_CREATE events from bot users before they render.
 */
export function initFilters(): () => void {
    const ownUserId = getOwnUserId();

    const unpatch = patcher.before("dispatch", FluxDispatcher, (args: any[]) => {
        const action = args[0];
        if (!storage.filtersEnabled) return;

        if (action?.type === "MESSAGE_CREATE" && action.message) {
            const m = action.message;
            // Don't filter own messages
            if (m.author?.id === ownUserId) return;
            // Filter bot messages when enabled
            if (m.author?.bot) {
                args[0] = { type: "__NETHER_FILTERED__" };
            }
        }
    });

    logger.log("[Nether] Bot filter initialized.");
    return () => {
        unpatch();
        logger.log("[Nether] Bot filter unloaded.");
    };
}