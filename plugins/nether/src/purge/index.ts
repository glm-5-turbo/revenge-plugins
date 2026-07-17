import { registerCommand } from "@vendetta/commands";
import { showConfirmationAlert } from "@vendetta/ui/alerts";
import { showToast } from "@vendetta/ui/toasts";
import { findByStoreName } from "@vendetta/metro";
import { storage } from "../storage";
import { discordApi, RateLimiter } from "../utils";
import { logger } from "@vendetta";

let unregCommand: (() => void) | null = null;
let purgeLimiter: RateLimiter;

export function initPurge(): () => void {
    purgeLimiter = new RateLimiter(storage.purgeDelay || 800);

    unregCommand = registerCommand({
        name: "purge",
        displayName: "Purge",
        description: "Delete your last N messages in this channel",
        displayDescription: "Delete your last N messages in this channel",
        applicationId: "-1",
        type: 1 as any,
        inputType: 1 as any,
        options: [
            {
                name: "count",
                displayName: "Count",
                description: "Number of messages to delete (1-100)",
                displayDescription: "Number of messages to delete (1-100)",
                type: 4 as any,
                required: true,
            },
            {
                name: "user",
                displayName: "User",
                description: "Only delete messages mentioning this user",
                displayDescription: "Only delete messages mentioning this user",
                type: 6 as any,
                required: false,
            },
        ],
        execute: async (args: any[], ctx: any) => {
            const channelId = ctx.channel?.id;
            if (!channelId) return { content: "❌ No channel." };

            let count = 5;
            let targetUser: string | null = null;

            for (const arg of args || []) {
                if (arg?.name === "count") count = Math.min(Math.max(parseInt(arg.value) || 5, 1), 100);
                if (arg?.name === "user") targetUser = arg.value;
            }

            const doPurge = async () => {
                try {
                    showToast(`🔄 Fetching ${count} messages...`);

                    // Get user identity via UserStore instead of API call when possible
                    let myId = "";
                    try {
                        const UserStore = findByStoreName("UserStore") as any;
                        myId = UserStore?.getCurrentUser()?.id || "";
                    } catch {}
                    if (!myId) {
                        const me = await discordApi("GET", "/users/@me");
                        myId = me?.id || "";
                    }
                    if (!myId) { showToast("❌ Could not identify you"); return; }

                    const msgs = await discordApi("GET", `/channels/${channelId}/messages?limit=${count}`);
                    if (!Array.isArray(msgs)) { showToast("❌ Failed to fetch messages"); return; }

                    let ids = msgs.filter(m => m?.author?.id === myId).map(m => m.id);

                    if (targetUser) {
                        ids = ids.filter(id => {
                            const msg = msgs.find(m => m.id === id);
                            return msg?.mentions?.some((u: any) => u.id === targetUser) ||
                                   msg?.content?.includes(`<@${targetUser}>`);
                        });
                    }

                    if (ids.length === 0) { showToast("✅ Nothing to delete"); return; }

                    // Bulk delete in batches of 100
                    for (let i = 0; i < ids.length; i += 100) {
                        const batch = ids.slice(i, i + 100);
                        await purgeLimiter.add(async () => {
                            await discordApi("POST", `/channels/${channelId}/messages/bulk-delete`, { messages: batch });
                        });
                    }

                    showToast(`✅ Deleted ${ids.length} messages`);
                } catch (e: any) {
                    showToast(`❌ ${e.message}`);
                    logger.error("[Nether] Purge error:", e);
                }
            };

            if (storage.purgeConfirm !== false) {
                showConfirmationAlert({
                    title: "Purge",
                    content: targetUser
                        ? `Delete your last ${count} messages mentioning that user?`
                        : `Delete your last ${count} messages?`,
                    confirmText: "Purge",
                    confirmColor: "red" as any,
                    onConfirm: doPurge,
                    cancelText: "Cancel",
                });
            } else {
                doPurge();
            }

            return { content: `Purging ${count} messages...` };
        },
    });

    logger.log("[Nether] Purge initialized.");
    return () => {
        if (unregCommand) unregCommand();
        logger.log("[Nether] Purge unloaded.");
    };
}