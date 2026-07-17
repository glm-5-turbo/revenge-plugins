import { patcher } from "@vendetta";
import { FluxDispatcher } from "@vendetta/metro/common";
import { storage } from "../storage";
import { logger } from "@vendetta";

export function initFilters(): () => void {
    let ownUserId = "";
    try {
        const { findByProps } = require("@vendetta/metro");
        const UserStore = findByProps("getCurrentUser");
        ownUserId = UserStore?.getCurrentUser()?.id || "";
    } catch { /* empty */ }

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

    logger.log("[Nether] Custom filters initialized.");
    return () => {
        unpatch();
        logger.log("[Nether] Custom filters unloaded.");
    };
}