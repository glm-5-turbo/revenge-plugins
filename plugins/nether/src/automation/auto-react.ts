import { patcher } from "@vendetta";
import { FluxDispatcher } from "@vendetta/metro/common";
import { discordApi } from "../utils";
import { storage } from "../storage";
import { logger } from "@vendetta";

let ownUserId = "";

export function initAutoReact(): () => void {
    const { findByStoreName } = require("@vendetta/metro");
    const UserStore = findByStoreName("UserStore");
    ownUserId = UserStore?.getCurrentUser()?.id || "";

    const unpatch = patcher.after("dispatch", FluxDispatcher, async (args: any[]) => {
        const action = args[0];
        if (!storage.autoReactEnabled) return;
        if (action?.type !== "MESSAGE_CREATE" || !action.message) return;

        const m = action.message;
        // Don't react to own messages or bots
        if (m.author?.id === ownUserId || m.author?.bot) return;

        // Only react if the message is in a tracked channel (or all channels if none specified)
        const trackedChannels: string[] = storage.autoReactChannels || [];
        if (trackedChannels.length > 0 && !trackedChannels.includes(m.channel_id)) return;

        // Only react if the message is from a tracked user (or all users if none specified)
        const trackedUsers: string[] = storage.autoReactUsers || [];
        if (trackedUsers.length > 0 && !trackedUsers.includes(m.author.id)) return;

        const emoji = storage.autoReactEmoji || "✅";

        try {
            const encodedEmoji = encodeURIComponent(emoji);
            await discordApi("PUT", `/channels/${m.channel_id}/messages/${m.id}/reactions/${encodedEmoji}/@me`);
        } catch (e: any) {
            // Silently fail — reaction failures are common (no permission, etc.)
            logger.error("[Nether] Auto-react failed:", e.message);
        }
    });

    logger.log("[Nether] Auto-react initialized.");
    return () => {
        unpatch();
        logger.log("[Nether] Auto-react unloaded.");
    };
}