import { patcher } from "@vendetta";
import { FluxDispatcher } from "@vendetta/metro/common";
import { showToast } from "@vendetta/ui/toasts";
import { discordApi } from "../utils";
import { getStorage } from "../storage";
import { logger } from "@vendetta";

let ownUserId = "";
let afkActive = false;
let afkTimeout: ReturnType<typeof setTimeout> | null = null;

async function getOwnUserId(): Promise<string> {
    if (ownUserId) return ownUserId;
    try {
        const { findByProps } = require("@vendetta/metro");
        const UserStore = findByProps("getCurrentUser");
        ownUserId = UserStore?.getCurrentUser()?.id || "";
    } catch {
        try {
            const me = await discordApi("GET", "/users/@me");
            ownUserId = me?.id || "";
        } catch { /* empty */ }
    }
    return ownUserId;
}

function isMentioned(content: string, userId: string): boolean {
    return (
        content.includes(`<@${userId}>`) ||
        content.includes(`<@!${userId}>`) ||
        content.includes(`<@&${userId}>`)
    );
}

export function initAFK(): () => void {
    const unpatchCreate = patcher.after("dispatch", FluxDispatcher, async (args: any[]) => {
        const action = args[0];
        if (!getStorage().afkEnabled || !afkActive) return;

        if (action?.type === "MESSAGE_CREATE" && action.message) {
            const m = action.message;
            // Ignore own messages and DMs from bots
            if (m.author?.bot) return;

            const userId = await getOwnUserId();
            if (!userId) return;

            if (m.author.id === userId) {
                // User sent a message manually — reset AFK
                afkActive = false;
                showToast("💤 AFK mode disabled.");
                return;
            }

            if (isMentioned(m.content, userId)) {
                const channelId = m.channel_id;
                const replyMsg = getStorage().afkMessage;
                const delay = getStorage().afkDelay;

                if (afkTimeout) clearTimeout(afkTimeout);
                afkTimeout = setTimeout(async () => {
                    try {
                        await discordApi("POST", `/channels/${channelId}/messages`, {
                            content: replyMsg,
                            message_reference: {
                                message_id: m.id,
                            },
                        });
                    } catch (e: any) {
                        logger.error("[Nether] AFK reply failed:", e);
                    }
                }, delay);
            }
        }
    });

    // Watch for AFK toggle in storage
    const storage = getStorage();
    const origAntiTyping = storage.antiTyping;

    // Expose toggle function
    (globalThis as any).__nether_setAFK = (enabled: boolean) => {
        afkActive = enabled;
        if (enabled) showToast("💤 AFK mode enabled.");
    };

    logger.log("[Nether] AFK initialized.");
    return () => {
        unpatchCreate();
        if (afkTimeout) clearTimeout(afkTimeout);
        afkActive = false;
        delete (globalThis as any).__nether_setAFK;
        logger.log("[Nether] AFK unloaded.");
    };
}

export function toggleAFK(enabled: boolean): void {
    afkActive = enabled;
}
