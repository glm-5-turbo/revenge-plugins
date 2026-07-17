import { patcher } from "@vendetta";
import { FluxDispatcher } from "@vendetta/metro/common";
import { showToast } from "@vendetta/ui/toasts";
import { findByProps } from "@vendetta/metro";
import { storage } from "../storage";
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
// This mirrors the structure in message-logger.ts
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

function clearChannel(channelId: string): void {
    // Cap at 500 per channel to avoid memory leaks
    const keys = Object.keys(ghostCache[channelId] || {});
    if (keys.length > 500) {
        const toDelete = keys.slice(0, keys.length - 500);
        for (const k of toDelete) delete ghostCache[channelId][k];
    }
}

export function initGhostPings(): () => void {
    let ownUserId = "";

    try {
        const UserStore = findByProps("getCurrentUser");
        ownUserId = UserStore?.getCurrentUser()?.id || "";
    } catch { /* empty */ }

    const unloads: (() => void)[] = [];

    // Hook MESSAGE_CREATE to cache messages for ghost ping detection
    // We need this separate cache because the message logger cache may not be enabled
    const unCache = patcher.after("dispatch", FluxDispatcher, (args: any[]) => {
        const action = args[0];
        if (!storage.ghostPings) return;

        if (action?.type === "MESSAGE_CREATE" && action.message) {
            cacheMessage(action.message);
            clearChannel(action.message.channel_id);
        }

        // Also cache MESSAGE_UPDATE so we can detect edited-away pings
        if (action?.type === "MESSAGE_UPDATE" && action.message) {
            const m = action.message;
            const old = getCached(m.channel_id, m.id);
            if (old) {
                // Check if old content had a ping but new content doesn't
                const hadPing =
                    (old.content?.includes(`<@${ownUserId}>`) ||
                     old.content?.includes(`<@!${ownUserId}>`));
                const stillHasPing =
                    !m.content?.includes(`<@${ownUserId}>`) &&
                    !m.content?.includes(`<@!${ownUserId}>`);
                if (hadPing && stillHasPing && ownUserId) {
                    showToast(`👻 Ghost ping (edit): ${old.authorName} removed your ping`);
                }
            }
            // Update cache
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
    // Note: In Revenge/Discord Android, the delete action format is typically:
    //   { type: "MESSAGE_DELETE", id: string, channel_id: string, guild_id?: string }
    // It does NOT carry the full message object with author/content.
    const unDelete = patcher.after("dispatch", FluxDispatcher, (args: any[]) => {
        const action = args[0];
        if (!storage.ghostPings) return;
        if (!ownUserId) return;

        if (action?.type === "MESSAGE_DELETE") {
            const msgId = action.id;
            const channelId = action.channel_id;
            const cached = getCached(channelId, msgId);
            if (cached) {
                const wasMentioned =
                    cached.content.includes(`<@${ownUserId}>`) ||
                    cached.content.includes(`<@!${ownUserId}>`) ||
                    cached.content.includes(`<@&${ownUserId}>`);
                if (wasMentioned) {
                    showToast(
                        `👻 Ghost ping from ${cached.authorName}: "${cached.content.slice(0, 80)}${cached.content.length > 80 ? "..." : ""}"`
                    );
                }
                // Clean up cache
                delete ghostCache[channelId]?.[msgId];
            }
        }
    });
    unloads.push(unDelete);

    logger.log("[Nether] Ghost pings initialized.");
    return () => {
        unloads.forEach((fn) => fn());
        // Clear cache
        for (const key of Object.keys(ghostCache)) {
            delete ghostCache[key];
        }
        logger.log("[Nether] Ghost pings unloaded.");
    };
}