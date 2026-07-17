import { registerCommand } from "@vendetta/commands";
import { showConfirmationAlert } from "@vendetta/ui/alerts";
import { showToast } from "@vendetta/ui/toasts";
import { safeFetch, findByProps } from "@vendetta";
import { storage } from "../storage";
import { logger } from "@vendetta";

let unregCommand: (() => void) | null = null;

// Try to extract Discord token from the running client
function getToken(): string {
    // Common patterns used across Discord builds
    const patterns = [
        () => findByProps("getToken")?.getToken?.(),
        () => findByProps("getToken", "getSuperProperties")?.getToken?.(),
        () => findByProps("HTTP", "request")?.HTTP?._token,
        () => findByProps("API", "api")?.API?._token,
    ];
    for (const fn of patterns) {
        try { const t = fn(); if (t) return t; } catch {}
    }
    return "";
}

async function discordApi(method: string, path: string, body?: any): Promise<any> {
    const token = getToken();
    if (!token) throw new Error("Could not find Discord auth token");

    const url = `https://discord.com/api/v10${path}`;
    const res = await safeFetch(url, {
        method,
        headers: {
            Authorization: token,
            "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    return res.json().catch(() => null);
}

export function initPurge(): () => void {
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
                type: 4 as any, // INTEGER
                required: true,
            },
        ],
        execute: async (args: any[], ctx: any) => {
            const channelId = ctx.channel?.id;
            if (!channelId) return { content: "❌ No channel." };

            const count = Math.min(Math.max(parseInt(args?.[0]?.value) || 5, 1), 100);

            const doPurge = async () => {
                try {
                    // Get own user
                    const me = await discordApi("GET", "/users/@me");
                    const ownId = me?.id;
                    if (!ownId) { showToast("❌ Could not identify you"); return; }

                    // Fetch messages
                    const msgs = await discordApi("GET", `/channels/${channelId}/messages?limit=${count}`);
                    if (!Array.isArray(msgs)) { showToast("❌ Failed to fetch messages"); return; }

                    const ownMsgIds = msgs.filter(m => m?.author?.id === ownId).map(m => m.id);
                    if (ownMsgIds.length === 0) { showToast("✅ No messages to delete"); return; }

                    // Bulk delete
                    for (let i = 0; i < ownMsgIds.length; i += 100) {
                        await discordApi("POST", `/channels/${channelId}/messages/bulk-delete`, {
                            messages: ownMsgIds.slice(i, i + 100),
                        });
                    }
                    showToast(`✅ Deleted ${ownMsgIds.length} messages`);
                } catch (e: any) {
                    showToast(`❌ ${e.message}`);
                    logger.error("[Nether] Purge error:", e);
                }
            };

            if (storage.purgeConfirm) {
                showConfirmationAlert({
                    title: "Purge",
                    content: `Delete your last ${count} messages?`,
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