import { registerCommand } from "@vendetta/commands";
import { findByProps } from "@vendetta";
import { showConfirmationAlert } from "@vendetta/ui/alerts";
import { showToast } from "@vendetta/ui/toasts";
import { storage } from "../storage";
import { logger } from "@vendetta";

let unregCommand: (() => void) | null = null;

// Use Discord's built-in HTTP module (already authenticated)
function getHTTP(): any {
    try {
        const http = findByProps("get", "post", "put", "delete", "patch");
        if (http?.get) return http;
    } catch {}
    try {
        const http = findByProps("HTTP", "request");
        if (http?.HTTP) return http.HTTP;
    } catch {}
    // Fallback: try the window vendetta object
    try {
        const v = (window as any).vendetta;
        if (v?.http) return v.http;
    } catch {}
    return null;
}

async function discordRequest(method: string, path: string, body?: any): Promise<any> {
    const http = getHTTP();
    if (!http) throw new Error("Could not find Discord HTTP module");

    const url = path.startsWith("/api/") ? path : `/api/v10${path}`;

    try {
        if (http.request) {
            return await http.request({ method, url, body, headers: { "Content-Type": "application/json" } });
        }
        if (http[method.toLowerCase()]) {
            const res = await http[method.toLowerCase()](url, body, undefined, { "Content-Type": "application/json" });
            if (res?.body) return typeof res.body === "string" ? JSON.parse(res.body) : res.body;
            return res;
        }
        throw new Error(`No method ${method} on HTTP module`);
    } catch (e: any) {
        throw new Error(`Discord API ${method} ${path}: ${e.message || e}`);
    }
}

async function fetchMessages(channelId: string, limit: number): Promise<any[]> {
    return await discordRequest("GET", `/channels/${channelId}/messages?limit=${Math.min(limit, 100)}`) || [];
}

async function bulkDelete(channelId: string, messageIds: string[]): Promise<void> {
    // Discord bulk delete max 100 per request, rate limit between batches
    for (let i = 0; i < messageIds.length; i += 100) {
        const batch = messageIds.slice(i, i + 100);
        await discordRequest("POST", `/channels/${channelId}/messages/bulk-delete`, { messages: batch });
        if (i + 100 < messageIds.length) {
            await new Promise(r => setTimeout(r, storage.purgeDelay));
        }
    }
}

export function initPurge(): () => void {
    unregCommand = registerCommand({
        name: "nether",
        displayName: "Nether",
        description: "Nether plugin — purge, auto, tweaks",
        displayDescription: "Nether plugin — purge, auto, tweaks",
        applicationId: "0",
        type: 1 as any,
        inputType: 1 as any,
        options: [
            {
                name: "purge",
                displayName: "Purge",
                description: "Delete your last messages",
                displayDescription: "Delete your last messages",
                type: 4 as any, // INTEGER — count of messages
                required: true,
            },
            {
                name: "user",
                displayName: "User",
                description: "Only delete messages that mention this user (optional)",
                displayDescription: "Only delete messages that mention this user",
                type: 6 as any, // USER
                required: false,
            },
        ],
        execute: async (args: any[], ctx: any) => {
            const channelId = ctx.channel?.id;
            if (!channelId) return { content: "❌ No channel context." };

            // Parse args — args is an array of { name, value } objects
            let count = 5;
            let targetUserId: string | null = null;

            for (const arg of args || []) {
                if (arg?.name === "purge" && arg?.value) {
                    count = Math.min(Math.max(parseInt(arg.value) || 5, 1), 100);
                }
                if (arg?.name === "user" && arg?.value) {
                    targetUserId = arg.value;
                }
            }

            const doPurge = async () => {
                try {
                    showToast(`🔄 Fetching last ${count} messages...`);

                    // Get our own user ID
                    const me = await discordRequest("GET", "/users/@me");
                    const ownId = me?.id || "";
                    if (!ownId) {
                        showToast("❌ Could not determine your user ID");
                        return;
                    }

                    const msgs = await fetchMessages(channelId, count);
                    const ownMsgs = msgs.filter((m: any) => m.author?.id === ownId);

                    if (targetUserId) {
                        // Filter to messages that mention the target user
                        const filtered = ownMsgs.filter((m: any) =>
                            m.mentions?.some((u: any) => u.id === targetUserId) ||
                            m.content?.includes(`<@${targetUserId}>`)
                        );
                        if (filtered.length === 0) {
                            showToast("✅ No matching messages found.");
                            return;
                        }
                        const ids = filtered.map((m: any) => m.id);
                        await bulkDelete(channelId, ids);
                        showToast(`✅ Deleted ${ids.length} messages targeting user`);
                    } else {
                        const ids = ownMsgs.map((m: any) => m.id);
                        if (ids.length === 0) {
                            showToast("✅ No messages to delete.");
                            return;
                        }
                        await bulkDelete(channelId, ids);
                        showToast(`✅ Deleted ${ids.length} messages`);
                    }
                } catch (e: any) {
                    showToast(`❌ Purge failed: ${e.message}`);
                    logger.error("[Nether] Purge error:", e);
                }
            };

            if (storage.purgeConfirm) {
                showConfirmationAlert({
                    title: "Purge Messages",
                    content: targetUserId
                        ? `Delete your last ${count} messages that mention that user?`
                        : `Delete your last ${count} messages?`,
                    confirmText: "Purge",
                    confirmColor: "red" as any,
                    onConfirm: doPurge,
                    cancelText: "Cancel",
                });
            } else {
                await doPurge();
            }

            return { content: `🗑️ Purging ${count} messages...` };
        },
    });

    logger.log("[Nether] Purge initialized.");
    return () => {
        if (unregCommand) unregCommand();
        logger.log("[Nether] Purge unloaded.");
    };
}