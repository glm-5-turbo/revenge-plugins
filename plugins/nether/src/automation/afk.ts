import { patcher } from "@vendetta";
import { FluxDispatcher } from "@vendetta/metro/common";
import { showToast } from "@vendetta/ui/toasts";
import { discordApi } from "../utils";
import { storage } from "../storage";
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
        } catch {}
    }
    return ownUserId;
}

function isMentioned(content: string, userId: string): boolean {
    return content.includes(`<@${userId}>`) || content.includes(`<@!${userId}>`);
}

export function initAFK(): () => void {
    afkActive = storage.afkEnabled;

    const unpatch = patcher.after("dispatch", FluxDispatcher, async (args: any[]) => {
        const action = args[0];
        if (!storage.afkEnabled || !afkActive) return;
        if (action?.type !== "MESSAGE_CREATE" || !action.message) return;

        const m = action.message;
        if (m.author?.bot) return;

        const userId = await getOwnUserId();
        if (!userId) return;

        if (m.author.id === userId) {
            afkActive = false;
            showToast("💤 AFK mode disabled.");
            return;
        }

        if (isMentioned(m.content, userId)) {
            if (afkTimeout) clearTimeout(afkTimeout);
            afkTimeout = setTimeout(async () => {
                try {
                    await discordApi("POST", `/channels/${m.channel_id}/messages`, {
                        content: storage.afkMessage,
                        message_reference: { message_id: m.id },
                    });
                } catch (e: any) {
                    logger.error("[Nether] AFK reply failed:", e);
                }
            }, storage.afkDelay);
        }
    });

    (globalThis as any).__nether_setAFK = (enabled: boolean) => {
        afkActive = enabled;
        if (enabled) showToast("💤 AFK mode enabled.");
    };

    logger.log("[Nether] AFK initialized.");
    return () => {
        unpatch();
        if (afkTimeout) clearTimeout(afkTimeout);
        afkActive = false;
        delete (globalThis as any).__nether_setAFK;
        logger.log("[Nether] AFK unloaded.");
    };
}