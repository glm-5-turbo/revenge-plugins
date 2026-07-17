import { patcher } from "@vendetta";
import { FluxDispatcher } from "@vendetta/metro/common";
import { showToast } from "@vendetta/ui/toasts";
import { storage } from "../storage";
import { getOwnUserId } from "../utils";
import { logger } from "@vendetta";

const messageCounts: Record<string, { count: number; lastReset: number; muted: boolean; mutedAt: number }> = {};

function getChannelStats(channelId: string) {
    if (!messageCounts[channelId]) {
        messageCounts[channelId] = { count: 0, lastReset: Date.now(), muted: false, mutedAt: 0 };
    }
    return messageCounts[channelId];
}

function resetIfExpired(stats: ReturnType<typeof getChannelStats>, windowMs: number = 10000) {
    if (Date.now() - stats.lastReset > windowMs) {
        stats.count = 0;
        stats.lastReset = Date.now();
    }
}

export function initSpamGuard(): () => void {
    let ownUserId = getOwnUserId();

    const unpatch = patcher.before("dispatch", FluxDispatcher, (args: any[]) => {
        const action = args[0];
        if (!storage.spamGuardEnabled) return;

        if (action?.type === "MESSAGE_CREATE" && action.message) {
            const m = action.message;
            const channelId = m.channel_id;

            // Don't block own messages — user needs to be able to turn off spam guard
            if (m.author?.id === ownUserId) return;

            const stats = getChannelStats(channelId);
            resetIfExpired(stats);
            stats.count++;

            const threshold = storage.spamGuardThreshold;
            const cooldown = storage.spamGuardCooldown;

            // Check if muted and cooldown expired
            if (stats.muted && Date.now() - stats.mutedAt > cooldown) {
                stats.muted = false;
            }

            if (stats.count >= threshold && !stats.muted) {
                stats.muted = true;
                stats.mutedAt = Date.now();
                showToast(`🔇 Spam detected. Hiding messages for ${(cooldown / 1000).toFixed(0)}s.`);
            }

            if (stats.muted) {
                // Swallow the message so it doesn't render
                args[0] = { type: "__NETHER_SPAM_BLOCKED__" };
            }
        }
    });

    logger.log("[Nether] Spam guard initialized.");
    return () => {
        unpatch();
        for (const key of Object.keys(messageCounts)) {
            delete messageCounts[key];
        }
        logger.log("[Nether] Spam guard unloaded.");
    };
}
