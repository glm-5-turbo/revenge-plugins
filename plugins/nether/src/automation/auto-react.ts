import { patcher } from "@vendetta";
import { FluxDispatcher } from "@vendetta/metro/common";
import { findByStoreName } from "@vendetta/metro";
import { discordApi } from "../utils";
import { storage } from "../storage";
import { logger } from "@vendetta";

let ownUserId = "";

// Track when we last sent a message in each channel
// channel_id -> timestamp of our last MESSAGE_CREATE
const lastOwnActivity: Record<string, number> = {};

export function initAutoReact(): () => void {
    const UserStore = findByStoreName("UserStore") as any;
    ownUserId = UserStore?.getCurrentUser()?.id || "";

    // Track our own outgoing messages (used for the 1-minute activity window)
    const unTrack = patcher.after("dispatch", FluxDispatcher, (args: any[]) => {
        const action = args[0];
        if (action?.type !== "MESSAGE_CREATE" || !action.message) return;
        const m = action.message;
        if (m.author?.id !== ownUserId) return;
        lastOwnActivity[m.channel_id] = Date.now();
    });

    // Main auto-react handler
    const unReact = patcher.after("dispatch", FluxDispatcher, async (args: any[]) => {
        const action = args[0];
        if (!storage.autoReactEnabled) return;
        if (action?.type !== "MESSAGE_CREATE" || !action.message) return;

        const m = action.message;
        // Don't react to own messages or bots
        if (m.author?.id === ownUserId || m.author?.bot) return;

        const channelId = m.channel_id;
        const guildId = m.guild_id;

        // Only react in DMs (private chats) — never in server channels
        const isDM = !guildId;
        if (!isDM) return;

        // Only react if we sent a message in this DM within the last 1 minute
        const lastActive = lastOwnActivity[channelId] || 0;
        const isRecent = Date.now() - lastActive < 60_000; // 1 minute
        if (!isRecent) return;

        const emoji = storage.autoReactEmoji || "✅";

        try {
            const encodedEmoji = encodeURIComponent(emoji);
            await discordApi("PUT", `/channels/${channelId}/messages/${m.id}/reactions/${encodedEmoji}/@me`);
        } catch (e: any) {
            logger.error("[Nether] Auto-react failed:", e.message);
        }
    });

    logger.log("[Nether] Auto-react initialized (DMs only, 1min activity).");
    return () => {
        unTrack();
        unReact();
        for (const key of Object.keys(lastOwnActivity)) delete lastOwnActivity[key];
        logger.log("[Nether] Auto-react unloaded.");
    };
}