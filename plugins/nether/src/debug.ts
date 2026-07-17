import { patcher } from "@vendetta";
import { FluxDispatcher } from "@vendetta/metro/common";
import { storage } from "./storage";
import { logger } from "@vendetta";

// Intercept all FluxDispatcher actions for debugging
// Enabled by the "Debug Mode" toggle in Settings
export function initDebug(): () => void {
    const unpatch = patcher.after("dispatch", FluxDispatcher, (args: any[]) => {
        if (!storage.debugMode) return;

        const action = args[0];
        if (!action || !action.type) return;

        // Skip internal actions and very frequent ones to avoid spam
        const type: string = action.type;
        if (
            type.startsWith("__NETHER_") ||
            type === "VOICE_STATE_UPDATES" ||
            type === "TYPING_START" // We'll log this one separately if needed
        ) return;

        // Log interesting actions
        const channelId = action.channel_id || action.message?.channel_id || action.channelId || "";
        const guildId = action.guild_id || action.message?.guild_id || "";

        logger.log(
            `[Nether Debug] ${type}` +
            (channelId ? ` channel=${channelId.slice(0, 8)}…` : "") +
            (guildId ? ` guild=${guildId.slice(0, 8)}…` : "")
        );
    });

    logger.log("[Nether] Debug mode initialized.");
    return () => {
        unpatch();
        logger.log("[Nether] Debug mode unloaded.");
    };
}