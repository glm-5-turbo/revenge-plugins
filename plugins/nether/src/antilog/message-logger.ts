import { patcher } from "@vendetta";
import { FluxDispatcher } from "@vendetta/metro/common";
import { showToast } from "@vendetta/ui/toasts";
import { storage } from "../storage";
import { logger } from "@vendetta";

interface CachedMessage {
    id: string;
    channelId: string;
    authorId: string;
    authorName: string;
    content: string;
    timestamp: string;
}

// In-memory cache — bounded to last 500 messages per channel
const MAX_PER_CHANNEL = 500;
const cache: Record<string, CachedMessage[]> = {};

function addMessage(msg: CachedMessage): void {
    if (!cache[msg.channelId]) cache[msg.channelId] = [];
    const channelCache = cache[msg.channelId];
    // Deduplicate
    if (channelCache.find((m) => m.id === msg.id)) return;
    channelCache.push(msg);
    // Trim
    if (channelCache.length > MAX_PER_CHANNEL) {
        cache[msg.channelId] = channelCache.slice(-MAX_PER_CHANNEL);
    }
}

function getCached(channelId: string, messageId: string): CachedMessage | undefined {
    return cache[channelId]?.find((m) => m.id === messageId);
}

export function initMessageLogger(): () => void {
    // Hook MESSAGE_CREATE to cache all incoming messages
    const unpatchCreate = patcher.after("dispatch", FluxDispatcher, (args: any[]) => {
        const action = args[0];
        if (!storage.messageLogger) return;

        if (action?.type === "MESSAGE_CREATE" && action.message) {
            const m = action.message;
            addMessage({
                id: m.id,
                channelId: m.channel_id,
                authorId: m.author?.id || "",
                authorName: m.author?.username || "Unknown",
                content: m.content || "",
                timestamp: m.timestamp || "",
            });
        }
    });

    // Hook MESSAGE_DELETE to show cached content
    const unpatchDelete = patcher.after("dispatch", FluxDispatcher, (args: any[]) => {
        const action = args[0];
        if (!storage.messageLogger) return;

        if (action?.type === "MESSAGE_DELETE") {
            const msgId = action.id;
            const channelId = action.channel_id;
            const cached = getCached(channelId, msgId);
            if (cached) {
                showToast(
                    `🗑️ Deleted: "${cached.content.slice(0, 80)}${cached.content.length > 80 ? "..." : ""}" — ${cached.authorName}`
                );
            }
        }

        if (action?.type === "MESSAGE_DELETE_BULK") {
            const ids: string[] = action.ids || [];
            const channelId = action.channel_id;
            showToast(`🗑️ ${ids.length} messages bulk deleted in this channel.`);
        }
    });

    // Hook MESSAGE_UPDATE for edit logging
    const unpatchUpdate = patcher.after("dispatch", FluxDispatcher, (args: any[]) => {
        const action = args[0];
        if (!storage.messageLogger) return;

        if (action?.type === "MESSAGE_UPDATE" && action.message) {
            const msgId = action.message.id;
            const channelId = action.message.channel_id;
            const cached = getCached(channelId, msgId);
            if (cached && action.message.content !== cached.content) {
                showToast(
                    `✏️ Edited by ${cached.authorName}: "${cached.content.slice(0, 60)}" → "${action.message.content.slice(0, 60)}"`
                );
                // Update cache with new content
                addMessage({
                    ...cached,
                    content: action.message.content,
                });
            }
        }
    });

    logger.log("[Nether] Message logger initialized.");
    return () => {
        unpatchCreate();
        unpatchDelete();
        unpatchUpdate();
        // Clear cache
        for (const key of Object.keys(cache)) {
            delete cache[key];
        }
        logger.log("[Nether] Message logger unloaded.");
    };
}
