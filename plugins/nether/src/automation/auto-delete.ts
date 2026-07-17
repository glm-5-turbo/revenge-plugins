import { patcher } from "@vendetta";
import { FluxDispatcher } from "@vendetta/metro/common";
import { findByStoreName } from "@vendetta/metro";
import { discordApi, sleep } from "../utils";
import { storage } from "../storage";
import { logger } from "@vendetta";

/**
 * Telegram-style Auto-Delete
 *
 * Automatically deletes your messages after a configurable delay
 * (default 24h). Requires Revenge to be running (background or foreground).
 *
 * Tracks message timestamps in memory and processes them in batches.
 * Uses REST API directly (bypasses FluxDispatcher) so it's stealthy.
 */

const DELETION_BATCH_SIZE = 5;
const PROCESS_INTERVAL = 60_000; // check every minute

interface PendingDelete {
    channelId: string;
    messageId: string;
    deleteAt: number;
}

let pendingDeletes: PendingDelete[] = [];
let processTimer: ReturnType<typeof setInterval> | null = null;

function scheduleMessage(channelId: string, messageId: string, timestamp: string): void {
    const msgTime = new Date(timestamp).getTime();
    const delay = storage.autoDeleteDelay || 86_400_000; // 24h default
    const deleteAt = msgTime + delay;

    // Don't schedule if already expired or expiring in < 60s
    if (deleteAt < Date.now() + 60_000) return;

    // Don't duplicate
    const existing = pendingDeletes.find(
        (p) => p.channelId === channelId && p.messageId === messageId
    );
    if (existing) return;

    pendingDeletes.push({ channelId, messageId, deleteAt });
}

async function processPendingDeletes(): Promise<void> {
    if (!storage.autoDeleteEnabled || pendingDeletes.length === 0) return;

    const now = Date.now();
    const due = pendingDeletes.filter((p) => p.deleteAt <= now);
    if (due.length === 0) return;

    // Remove due items from pending
    pendingDeletes = pendingDeletes.filter((p) => p.deleteAt > now);

    // Get own user ID for a quick sanity check
    let ownUserId = "";
    try {
        const UserStore = findByStoreName("UserStore") as any;
        ownUserId = UserStore?.getCurrentUser()?.id || "";
    } catch {}

    // Delete in small batches to avoid rate limits
    let deleted = 0;
    for (let i = 0; i < due.length; i += DELETION_BATCH_SIZE) {
        const batch = due.slice(i, i + DELETION_BATCH_SIZE);
        const results = await Promise.allSettled(
            batch.map((p) =>
                discordApi("DELETE", `/channels/${p.channelId}/messages/${p.messageId}`)
                    .then(() => deleted++)
                    .catch(() => {})
            )
        );
        // Small delay between batches
        if (i + DELETION_BATCH_SIZE < due.length) {
            await sleep(500);
        }
    }

    if (deleted > 0) {
        logger.log(`[Nether] Auto-delete: ${deleted} message(s) deleted`);
    }
}

export function initAutoDelete(): () => void {
    // Track our own outgoing messages
    const unpatch = patcher.after("dispatch", FluxDispatcher, (args: any[]) => {
        const action = args[0];
        if (!storage.autoDeleteEnabled) return;

        if (action?.type === "MESSAGE_CREATE" && action.message) {
            const m = action.message;

            // Only track our own messages
            if (!m.author?.id) return;
            try {
                const UserStore = findByStoreName("UserStore") as any;
                if (m.author.id !== UserStore?.getCurrentUser()?.id) return;
            } catch { return; }

            // Check channel filter
            const allowed = storage.autoDeleteChannels || [];
            if (allowed.length > 0 && !allowed.includes(m.channel_id)) return;

            scheduleMessage(m.channel_id, m.id, m.timestamp);
        }
    });

    // Start background processor
    processTimer = setInterval(processPendingDeletes, PROCESS_INTERVAL);

    // Also run once immediately for any backlog
    setTimeout(processPendingDeletes, 5_000);

    logger.log("[Nether] Auto-delete initialized.");
    return () => {
        unpatch();
        if (processTimer) clearInterval(processTimer);
        processTimer = null;
        pendingDeletes = [];
        logger.log("[Nether] Auto-delete unloaded.");
    };
}