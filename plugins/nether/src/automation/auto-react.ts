import { patcher } from "@vendetta";
import { FluxDispatcher } from "@vendetta/metro/common";
import { discordApi } from "../utils";
import { getStorage, AutoReactRule } from "../storage";
import { logger } from "@vendetta";

export function initAutoReact(): () => void {
    const unpatch = patcher.after("dispatch", FluxDispatcher, async (args: any[]) => {
        const action = args[0];
        if (!getStorage().autoReactEnabled) return;
        if (action?.type !== "MESSAGE_CREATE" || !action.message) return;

        const m = action.message;
        const rules = getStorage().autoReactRules;

        for (const rule of rules) {
            const matchesChannel = !rule.channelId || m.channel_id === rule.channelId;
            const matchesUser = !rule.userId || m.author?.id === rule.userId;

            if (matchesChannel && matchesUser) {
                try {
                    await discordApi("PUT", `/channels/${m.channel_id}/messages/${m.id}/reactions/${encodeURIComponent(rule.emoji)}/@me`);
                } catch (e: any) {
                    logger.error("[Nether] Auto-react failed:", e);
                }
            }
        }
    });

    logger.log("[Nether] Auto-react initialized.");
    return () => {
        unpatch();
        logger.log("[Nether] Auto-react unloaded.");
    };
}
