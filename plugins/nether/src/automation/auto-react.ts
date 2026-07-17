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

    // Listen for our own MESSAGE_CREATE to track activity
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

        const isDM = !guildId;
        const emoji = storage.autoReactEmoji || "✅";

        if (isDM) {
            // Always react in DMs — they're private, low stakes
            await doReact(channelId, m.id, emoji);
            return;
        }

        // In server channels: only react if we've been active recently
        const lastActive = lastOwnActivity[channelId] || 0;
        const isRecent = (Date.now() - lastActive) < 5 * 60 * 1000; // 5 minutes

        if (isRecent) {
            await doReact(channelId, m.id, emoji);
        }
        // Otherwise skip — user is passive/lurking
    });

    logger.log("[Nether] Auto-react initialized.");
    return () => {
        unTrack();
        unReact();
        for (const key of Object.keys(lastOwnActivity)) delete lastOwnActivity[key];
        logger.log("[Nether] Auto-react unloaded.");
    };
}

async function doReact(channelId: string, messageId: string, emoji: string): Promise<void> {
    try {
        const encodedEmoji = encodeURIComponent(emoji);
        await discordApi("PUT", `/channels/${channelId}/messages/${messageId}/reactions/${encodedEmoji}/@me`);
    } catch (e: any) {
        logger.error("[Nether] Auto-react failed:", e.message);
    }
}