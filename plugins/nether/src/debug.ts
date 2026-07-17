import { patcher, findAll } from "@vendetta";
import { FluxDispatcher } from "@vendetta/metro/common";
import { storage } from "./storage";
import { logger } from "@vendetta";

// Intercept all FluxDispatcher actions for debugging
// Enabled by the "Debug Mode" toggle in Settings
export function initDebug(): () => void {
    // Dump all metro component displayNames on every load
    // This helps identify the correct component name for the guild sidebar button
    try {
        const all = findAll(() => true) as any[];
        const comps = all
            .filter(m => m && (m.displayName || m.name))
            .map(m => ({ displayName: m.displayName, name: m.name }));
        // Filter to likely sidebar/guild related names
        const keywords = ["Guild", "Sidebar", "Server", "Channel", "Home", "List", "Bar", "Nav"];
        const matches = comps.filter(c =>
            (c.displayName && keywords.some(k => c.displayName.includes(k))) ||
            (c.name && keywords.some(k => c.name.includes(k)))
        );
        if (matches.length > 0) {
            logger.log("[Nether] Sidebar components: " + JSON.stringify(matches));
        } else {
            // Log a sample of all components to see what's available
            const sample = comps.slice(0, 20);
            logger.log("[Nether] First 20 components: " + JSON.stringify(sample));
        }
    } catch (e: any) {
        logger.error("[Nether] Component scan failed: " + e.message);
    }

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