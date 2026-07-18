import { patcher } from "@vendetta";
import { FluxDispatcher } from "@vendetta/metro/common";
import { findByStoreName } from "@vendetta/metro";
import { discordApi, sleep } from "../utils";
import { storage } from "../storage";
import { logger } from "@vendetta";
import { showToast } from "@vendetta/ui/toasts";

/**
 * Telegram-style Auto-Delete
 *
 * Automatically deletes your messages after a configurable delay (default 24h).
 *
 * Two-tier tracking:
 *   1. In-process cache (`pendingDeletes`) — populated when you send messages
 *      while the plugin is loaded. Survives navigation between channels.
 *   2. Startup rescan — on plugin load, scan all open/cached channels via
 *      MessageStore, find your messages, delete any that are expired, and
 *      keep unexpired ones cached for future deletion.
 *
 * The rescan handles messages you sent BEFORE the plugin was enabled, and
 * catches messages from any open channels.
 */

const DELETION_BATCH_SIZE = 5;
const PROCESS_INTERVAL = 60_000; // 1 minute
const RESCAN_DELAY_MS = 8_000;   // wait after init so MessageStore is populated

interface PendingDelete {
    channelId: string;
    messageId: string;
    deleteAt: number;
    content: string;
}

let pendingDeletes: PendingDelete[] = [];
let processTimer: ReturnType<typeof setInterval> | null = null;
let rescanTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleMessage(channelId: string, messageId: string, timestamp: string, content: string = ""): void {
    const msgTime = new Date(timestamp).getTime();
    const delay = storage.autoDeleteDelay || 86_400_000; // 24h default
    const deleteAt = msgTime + delay;

    // Don't duplicate
    const existing = pendingDeletes.find(
        (p) => p.channelId === channelId && p.messageId === messageId
    );
    if (existing) return;

    pendingDeletes.push({ channelId, messageId, deleteAt, content });
}

/**
 * Rescan the MessageStore for all YOUR messages and:
 *   - Delete any that are past their expiry time
 *   - Cache any that aren't yet expired for future deletion
 *
 * Runs automatically on plugin init and can be triggered manually via the
 * /nether-toggle rescan command (not yet exposed).
 */
async function rescanAndClean(): Promise<void> {
    if (!storage.autoDeleteEnabled) return;

    let ownUserId = "";
    try {
        const UserStore = findByStoreName("UserStore") as any;
        ownUserId = UserStore?.getCurrentUser()?.id || "";
    } catch {}
    if (!ownUserId) return;

    const MessageStore = findByStoreName("MessageStore") as any;
    if (!MessageStore) return;

    const delay = storage.autoDeleteDelay || 86_400_000;
    const now = Date.now();

    let scanned = 0;
    let expired = 0;
    let cached = 0;

    // Iterate over all channels in the store
    // MessageStore.getAllMessages() returns an iterable of channel message maps
    // but the API varies. Try a few approaches.
    const channelIds: string[] = [];

    try {
        // Approach 1: ChannelStore/GuildChannelStore provides channel list
        const ChannelStore = findByStoreName("ChannelStore") as any;
        const GuildChannelStore = findByStoreName("GuildChannelStore") as any;
        const PrivateChannelStore = findByStoreName("PrivateChannelStore") as any;

        const collect = (store: any) => {
            if (!store) return;
            const all = store.getAllChannels?.() ?? Object.values(store);
            for (const ch of all) {
                if (ch?.id) channelIds.push(ch.id);
            }
        };
        collect(ChannelStore);
        collect(GuildChannelStore);
        collect(PrivateChannelStore);
    } catch {}

    // De-dupe
    const uniqueIds = Array.from(new Set(channelIds));

    for (const channelId of uniqueIds) {
        try {
            const msgs = MessageStore.getMessages?.(channelId);
            if (!msgs) continue;
            // msgs is a MessageMap - iterate values
            const values = typeof msgs.values === "function" ? Array.from(msgs.values()) : Object.values(msgs);
            for (const m of values) {
                if (!m?.id || m.author?.id !== ownUserId) continue;
                if (!m.timestamp) continue;
                scanned++;

                const msgTime = new Date(m.timestamp).getTime();
                const deleteAt = msgTime + delay;

                if (deleteAt <= now) {
                    // Expired — delete
                    try {
                        await discordApi("DELETE", `/channels/${channelId}/messages/${m.id}`);
                        expired++;
                        await sleep(200); // small delay to avoid rate limit
                    } catch {}
                } else {
                    // Not yet expired — cache for later
                    scheduleMessage(channelId, m.id, m.timestamp, m.content || "");
                    cached++;
                }
            }
        } catch {}
    }

    logger.log(`[Nether] Auto-delete rescan: scanned=${scanned}, expired=${expired}, cached=${cached}`);
    if (expired > 0 || cached > 0) {
        showToast(`🧹 Auto-delete rescan\nScanned ${scanned} messages\nDeleted ${expired} expired\nCached ${cached} pending`);
    }
}

async function processPendingDeletes(): Promise<void> {
    if (!storage.autoDeleteEnabled || pendingDeletes.length === 0) return;

    const now = Date.now();
    const due = pendingDeletes.filter((p) => p.deleteAt <= now);
    if (due.length === 0) return;

    pendingDeletes = pendingDeletes.filter((p) => p.deleteAt > now);

    let deleted = 0;
    for (let i = 0; i < due.length; i += DELETION_BATCH_SIZE) {
        const batch = due.slice(i, i + DELETION_BATCH_SIZE);
        await Promise.allSettled(
            batch.map((p) =>
                discordApi("DELETE", `/channels/${p.channelId}/messages/${p.messageId}`)
                    .then(() => deleted++)
                    .catch(() => {})
            )
        );
        if (i + DELETION_BATCH_SIZE < due.length) {
            await sleep(500);
        }
    }

    if (deleted > 0) {
        logger.log(`[Nether] Auto-delete: ${deleted} message(s) deleted`);
    }
}

export function initAutoDelete(): () => void {
    let ownUserId = "";
    try {
        const UserStore = findByStoreName("UserStore") as any;
        ownUserId = UserStore?.getCurrentUser()?.id || "";
    } catch {}

    // Track our own outgoing messages (live cache)
    const unpatch = patcher.after("dispatch", FluxDispatcher, (args: any[]) => {
        const action = args[0];
        if (!storage.autoDeleteEnabled) return;

        if (action?.type === "MESSAGE_CREATE" && action.message) {
            const m = action.message;
            if (!m.author?.id || m.author.id !== ownUserId) return;

            // Channel filter
            const allowed = storage.autoDeleteChannels || [];
            if (allowed.length > 0 && !allowed.includes(m.channel_id)) return;

            scheduleMessage(m.channel_id, m.id, m.timestamp, m.content || "");
        }
    });

    // Background processor
    processTimer = setInterval(processPendingDeletes, PROCESS_INTERVAL);

    // Startup rescan — handle backlog from before plugin was loaded
    rescanTimer = setTimeout(() => rescanAndClean().catch((e) => {
        logger.error("[Nether] Auto-delete rescan failed:", e);
    }), RESCAN_DELAY_MS);

    // Run immediate pass too (catches messages sent during RESCAN_DELAY_MS)
    setTimeout(processPendingDeletes, 5_000);

    logger.log("[Nether] Auto-delete initialized.");
    return () => {
        unpatch();
        if (processTimer) clearInterval(processTimer);
        if (rescanTimer) clearTimeout(rescanTimer);
        processTimer = null;
        rescanTimer = null;
        pendingDeletes = [];
        logger.log("[Nether] Auto-delete unloaded.");
    };
}