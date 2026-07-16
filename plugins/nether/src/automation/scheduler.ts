import { discordApi, sleep } from "../utils";
import { getStorage } from "../storage";
import { showToast } from "@vendetta/ui/toasts";
import { logger } from "@vendetta";

interface ScheduledMessage {
    id: string;
    channelId: string;
    content: string;
    sendAt: number; // Unix timestamp ms
}

const scheduled: ScheduledMessage[] = [];
let interval: ReturnType<typeof setInterval> | null = null;

function startScheduler(): void {
    if (interval) return;
    interval = setInterval(async () => {
        const now = Date.now();
        const toSend = scheduled.filter((m) => m.sendAt <= now);
        for (const msg of toSend) {
            try {
                await discordApi("POST", `/channels/${msg.channelId}/messages`, {
                    content: msg.content,
                });
                showToast(`✅ Scheduled message sent in ${msg.channelId}.`);
                const idx = scheduled.indexOf(msg);
                if (idx !== -1) scheduled.splice(idx, 1);
            } catch (e: any) {
                logger.error("[Nether] Scheduled send failed:", e);
                showToast(`❌ Failed to send scheduled message: ${e.message}`);
            }
        }
    }, 5000); // Check every 5 seconds
}

function stopScheduler(): void {
    if (interval) {
        clearInterval(interval);
        interval = null;
    }
}

export function initScheduler(): () => void {
    if (getStorage().schedulerEnabled) startScheduler();

    logger.log("[Nether] Scheduler initialized.");
    return () => {
        stopScheduler();
        scheduled.length = 0;
        logger.log("[Nether] Scheduler unloaded.");
    };
}

export { scheduled, startScheduler, stopScheduler };
