import { patcher } from "@vendetta";
import { FluxDispatcher } from "@vendetta/metro/common";
import { findByStoreName } from "@vendetta/metro";
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

// Track messages we've already seen a MESSAGE_DELETE for — don't alert again
const confirmedDeletes = new Set<string>();

// Track messages we've shown a toast for (avoid duplicates)
const notifiedMessages = new Set<string>();

// Polling interval for silent delete detection
let pollInterval: ReturnType<typeof setInterval> | null = null;
const POLL_MS = 8_000; // check every 8 seconds

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

function removeFromCache(channelId: string, messageId: string): void {
    if (!cache[channelId]) return;
    cache[channelId] = cache[channelId].filter((m) => m.id !== messageId);
    if (cache[channelId].length === 0) delete cache[channelId];
}

/**
 * Periodic poll to detect "silent deletes" — messages that vanished
 * from the UI but never dispatched MESSAGE_DELETE (likely because
 * another plugin suppressed it via patcher.before).
 *
 * Compares our cache against Discord's MessageStore to find gaps.
 */
function startSilentDeleteDetector(): void {
    if (pollInterval) return;

    pollInterval = setInterval(() => {
        if (!storage.messageLogger) return;

        try {
            const MessageStore = findByStoreName("MessageStore") as any;
            if (!MessageStore) return;

            for (const [channelId, msgs] of Object.entries(cache)) {
                const cachedMsgs = msgs as CachedMessage[];
                const channelMessages = MessageStore.getMessages(channelId);
                if (!channelMessages) continue;

                for (const cached of cachedMsgs) {
                    const key = `${channelId}:${cached.id}`;

                    // Skip messages we already handled
                    if (confirmedDeletes.has(key)) continue;
                    if (notifiedMessages.has(key)) continue;

                    // Check if the message still exists in the store
                    const stillExists = channelMessages.get(cached.id) != null;
                    if (!stillExists) {
                        // Message vanished without a MESSAGE_DELETE event!
                        // This means someone's anti-log suppressed it
                        notifiedMessages.add(key);
                        showToast(
                            `🕵️ Silent delete (anti-log blocked): "${cached.content.slice(0, 80)}${cached.content.length > 80 ? "..." : ""}" — ${cached.authorName}`
                        );
                    }
                }
            }
        } catch (e) {
            // Polling errors are non-critical — skip this cycle
        }
    }, POLL_MS);
}

function stopSilentDeleteDetector(): void {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
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
            const key = `${channelId}:${msgId}`;

            // Mark as confirmed delete so silent detector skips it
            confirmedDeletes.add(key);

            const cached = getCached(channelId, msgId);
            if (cached) {
                // Show a nice delete toast — highlighted to show it was caught
                showToast(
                    `🗑️ Deleted: "${cached.content.slice(0, 80)}${cached.content.length > 80 ? "..." : ""}" — ${cached.authorName}`
                );
                removeFromCache(channelId, msgId);
            }
        }

        if (action?.type === "MESSAGE_DELETE_BULK") {
            const ids: string[] = action.ids || [];
            const channelId = action.channel_id || "";
            for (const id of ids) {
                confirmedDeletes.add(`${channelId}:${id}`);
            }
            showToast(`🗑️ ${ids.length} messages bulk deleted`);
        }
    });

    // Hook MESSAGE_UPDATE to detect edits
    const unpatchUpdate = patcher.after("dispatch", FluxDispatcher, (args: any[]) => {
        const action = args[0];
        if (!storage.messageLogger) return;

        if (action?.type === "MESSAGE_UPDATE" && action.message) {
            const msgId = action.message.id;
            const channelId = action.message.channel_id;
            const cached = getCached(channelId, msgId);
            const newContent = action.message.content;

            if (cached && newContent && newContent !== cached.content) {
                // Show formatted edit toast
                showToast(
                    `✏️ ${cached.authorName} edited: "${cached.content.slice(0, 50)}" → "${newContent.slice(0, 50)}"`
                );

                // Update cache
                addMessage({
                    ...cached,
                    content: newContent,
                });
            }
        }
    });

    // Start periodic check for silent deletes (anti-anti-log)
    startSilentDeleteDetector();

    logger.log("[Nether] Message logger initialized.");
    return () => {
        unpatchCreate();
        unpatchDelete();
        unpatchUpdate();
        stopSilentDeleteDetector();
        for (const key of Object.keys(cache)) delete cache[key];
        confirmedDeletes.clear();
        notifiedMessages.clear();
        logger.log("[Nether] Message logger unloaded.");
    };
}