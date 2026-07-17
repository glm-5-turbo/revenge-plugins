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

// Track which messages we've marked as edited to avoid double-marking
const editedMarked = new Set<string>();

function addMessage(msg: CachedMessage): void {
    if (!cache[msg.channelId]) cache[msg.channelId] = [];
    const channelCache = cache[msg.channelId];
    if (channelCache.find((m) => m.id === msg.id)) return;
    channelCache.push(msg);
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
            showToast(`🗑️ ${ids.length} messages bulk deleted in this channel.`);
        }
    });

    // Hook MESSAGE_UPDATE to detect edits and mark them in the UI
    const unpatchUpdate = patcher.before("dispatch", FluxDispatcher, (args: any[]) => {
        const action = args[0];
        if (!storage.messageLogger) return;

        if (action?.type === "MESSAGE_UPDATE" && action.message) {
            const msgId = action.message.id;
            const channelId = action.message.channel_id;
            const cached = getCached(channelId, msgId);
            const newContent = action.message.content;

            if (cached && newContent && newContent !== cached.content) {
                // Show toast with old → new
                showToast(
                    `✏️ ${cached.authorName} edited: "${cached.content.slice(0, 50)}" → "${newContent.slice(0, 50)}"`
                );

                // Inject a visible [edited] tag into the message content
                // so it's obvious in the chat UI
                if (!editedMarked.has(msgId)) {
                    editedMarked.add(msgId);
                    action.message.content = `[edited] ${newContent}`;
                }

                // Update cache
                addMessage({
                    ...cached,
                    content: newContent,
                });
            }
        }
    });

    logger.log("[Nether] Message logger initialized.");
    return () => {
        unpatchCreate();
        unpatchDelete();
        unpatchUpdate();
        editedMarked.clear();
        for (const key of Object.keys(cache)) delete cache[key];
        logger.log("[Nether] Message logger unloaded.");
    };
}