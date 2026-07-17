import { patcher } from "@vendetta";
import { FluxDispatcher } from "@vendetta/metro/common";
import { findByStoreName } from "@vendetta/metro";
import { discordApi } from "../utils";
import { storage } from "../storage";
import { logger } from "@vendetta";

let ownUserId = "";

// Track when we last sent a message to anyone
// Used for the 1-minute activity window in DMs
let lastOwnMessageTime = 0;

export function initAutoReact(): () => void {
    const UserStore = findByStoreName("UserStore") as any;
    ownUserId = UserStore?.getCurrentUser()?.id || "";

    // Track our own messages
    const unTrack = patcher.after("dispatch", FluxDispatcher, (args: any[]) => {
        const action = args[0];
        if (action?.type !== "MESSAGE_CREATE" || !action.message) return;
        const m = action.message;
        if (m.author?.id !== ownUserId) return;
        lastOwnMessageTime = Date.now();
    });

    // Auto-react only in DMs, only if we sent a message in the last 60s
    const unReact = patcher.after("dispatch", FluxDispatcher, async (args: any[]) => {
        const action = args[0];
        if (!storage.autoReactEnabled) return;
        if (action?.type !== "MESSAGE_CREATE" || !action.message) return;

        const m = action.message;
        if (m.author?.id === ownUserId || m.author?.bot) return;
        if (m.guild_id) return; // DMs only — no server channels

        const recentlyActive = (Date.now() - lastOwnMessageTime) < 60_000;
        if (!recentlyActive) return;

        const emoji = storage.autoReactEmoji || "✅";
        try {
            const encoded = encodeURIComponent(emoji);
            await discordApi("PUT", `/channels/${m.channel_id}/messages/${m.id}/reactions/${encoded}/@me`);
        } catch (e: any) {
            logger.error("[Nether] Auto-react failed:", e.message);
        }
    });

    logger.log("[Nether] Auto-react initialized.");
    return () => {
        unTrack();
        unReact();
        lastOwnMessageTime = 0;
        logger.log("[Nether] Auto-react unloaded.");
    };
}