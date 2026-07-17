import { patcher } from "@vendetta";
import { FluxDispatcher } from "@vendetta/metro/common";
import { storage, FilterRule } from "../storage";
import { logger } from "@vendetta";

function matchesRule(rule: FilterRule, message: any, ownUserId: string): boolean {
    switch (rule.type) {
        case "user":
            return message.author?.id === rule.value;
        case "regex":
            try {
                return new RegExp(rule.value, "i").test(message.content || "");
            } catch {
                return false;
            }
        case "bot":
            return message.author?.bot === true;
        default:
            return false;
    }
}

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
            const rules = storage.filterRules;

            // Don't filter own messages
            if (m.author?.id === ownUserId) return;

            for (const rule of rules) {
                if (matchesRule(rule, m, ownUserId)) {
                    // Swallow the event
                    args[0] = { type: "__NETHER_FILTERED__" };
                    return;
                }
            }
        }
    });

    logger.log("[Nether] Custom filters initialized.");
    return () => {
        unpatch();
        logger.log("[Nether] Custom filters unloaded.");
    };
}
