import { patcher } from "@vendetta";
import { FluxDispatcher } from "@vendetta/metro/common";
import { showToast } from "@vendetta/ui/toasts";
import { storage } from "../storage";
import { getOwnUserId } from "../utils";
import { logger } from "@vendetta";

// Ghost ping detection relies on the message logger's cache
// since MESSAGE_DELETE only has {id, channel_id, guild_id} in Discord Android.
// We use the FluxDispatcher dispatch chain to correlate cached messages
// with delete events.

interface GhostPingInfo {
    authorName: string;
    content: string;
}

// Shared in-memory cache: channel_id -> message_id -> message info
const ghostCache: Record<string, Record<string, GhostPingInfo>> = {};

function cacheMessage(msg: any): void {
    if (!msg?.id || !msg?.channel_id || !msg?.author?.id) return;
    if (!ghostCache[msg.channel_id]) ghostCache[msg.channel_id] = {};
    ghostCache[msg.channel_id][msg.id] = {
        authorName: msg.author.username || "Unknown",
        content: msg.content || "",
    };
}

function getCached(channelId: string, messageId: string): GhostPingInfo | undefined {
    return ghostCache[channelId]?.[messageId];
}

function capChannel(channelId: string): void {
    const keys = Object.keys(ghostCache[channelId] || {});
    if (keys.length > 500) {
        const toDelete = keys.slice(0, keys.length - 500);
        for (const k of toDelete) delete ghostCache[channelId][k];
    }
}

export function initGhostPings(): () => void {
    // Resolve ownUserId lazily — UserStore may not be populated at load time
    let ownUserId = "";
    const resolveUserId = () => {
        if (!ownUserId) ownUserId = getOwnUserId();
        return ownUserId;
    };
    const unloads: (() => void)[] = [];

    // Hook MESSAGE_CREATE to cache messages for ghost ping detection
    const unCache = patcher.after("dispatch", FluxDispatcher, (args: any[]) => {
        const action = args[0];
        if (!storage.ghostPings) return;

        if (action?.type === "MESSAGE_CREATE" && action.message) {
            cacheMessage(action.message);
            capChannel(action.message.channel_id);
        }

        // Detect edit-away ghost pings: message had @mention but was edited to remove it
        if (action?.type === "MESSAGE_UPDATE" && action.message) {
            const m = action.message;
            const old = getCached(m.channel_id, m.id);
            const uid = resolveUserId();
            if (old && uid) {
                const hadPing =
                    old.content?.includes(`<@${ownUserId}>`) ||
                    old.content?.includes(`<@!${ownUserId}>`);
                const pingRemoved =
                    hadPing &&
                    !m.content?.includes(`<@${ownUserId}>`) &&
                    !m.content?.includes(`<@!${ownUserId}>`);
                if (pingRemoved) {
                    showToast(`👻 Ghost ping (edit): ${old.authorName} removed your ping`);
                }
            }
            // Update cache with new content
            if (m.content && m.channel_id && m.id) {
                if (!ghostCache[m.channel_id]) ghostCache[m.channel_id] = {};
                if (ghostCache[m.channel_id][m.id]) {
                    ghostCache[m.channel_id][m.id].content = m.content;
                }
            }
        }
    });
    unloads.push(unCache);

    // Hook MESSAGE_DELETE to detect ghost pings
    const unDelete = patcher.after("dispatch", FluxDispatcher, (args: any[]) => {
        const action = args[0];
        if (!storage.ghostPings) return;
        const uid = resolveUserId();
        if (!uid) return;

        if (action?.type === "MESSAGE_DELETE") {
            const msgId = action.id;
            const channelId = action.channel_id;
            const cached = getCached(channelId, msgId);
            if (cached) {
                const wasMentioned =
                    cached.content.includes(`<@${uid}>`) ||
                    cached.content.includes(`<@!${uid}>`) ||
                    cached.content.includes(`<@&${uid}>`);
                if (wasMentioned) {
                    showToast(
                        `👻 Ghost ping from ${cached.authorName}: "${cached.content.slice(0, 80)}${cached.content.length > 80 ? "..." : ""}"`
                    );
                }
                delete ghostCache[channelId]?.[msgId];
            }
        }
    });
    unloads.push(unDelete);

    logger.log("[Nether] Ghost pings initialized.");
    return () => {
        unloads.forEach((fn) => fn());
        for (const key of Object.keys(ghostCache)) {
            delete ghostCache[key];
        }
        logger.log("[Nether] Ghost pings unloaded.");
    };
}