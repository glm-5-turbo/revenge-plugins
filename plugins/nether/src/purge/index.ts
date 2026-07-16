import { registerCommand } from "@vendetta/commands";
import { showConfirmationAlert } from "@vendetta/ui/alerts";
import { showToast } from "@vendetta/ui/toasts";
import { discordApi, RateLimiter, sleep } from "../utils";
import { getStorage } from "../storage";
import { logger } from "@vendetta";

let purgeLimiter: RateLimiter;
let unregCommand: (() => void) | null = null;

async function fetchChannelMessages(channelId: string, limit: number): Promise<any[]> {
    const data = await discordApi("GET", `/channels/${channelId}/messages?limit=${Math.min(limit, 100)}`);
    return data || [];
}

async function purgeMessages(channelId: string, messageIds: string[]): Promise<void> {
    if (!purgeLimiter) {
        purgeLimiter = new RateLimiter(getStorage().purgeDelay);
    }

    // Discord bulk delete API accepts max 100 messages at once
    for (let i = 0; i < messageIds.length; i += 100) {
        const batch = messageIds.slice(i, i + 100);
        await purgeLimiter.add(async () => {
            await discordApi("POST", `/channels/${channelId}/messages/bulk-delete`, {
                messages: batch,
            });
        });
    }
}

export function initPurge(): () => void {
    unregCommand = registerCommand({
        name: "nether",
        displayName: "nether",
        description: "Nether plugin commands",
        displayDescription: "Nether plugin commands",
        applicationId: "-1",
        type: 1 as any,
        inputType: 1 as any,
        options: [
            {
                name: "purge",
                displayName: "purge",
                description: "Delete your last N messages",
                displayDescription: "Delete your last N messages",
                type: 1 as any, // SUB_COMMAND
                options: [
                    {
                        name: "count",
                        displayName: "count",
                        description: "Number of messages to delete (1-100)",
                        displayDescription: "Number of messages to delete (1-100)",
                        required: true,
                        type: 4 as any, // INTEGER
                    },
                ],
            },
            {
                name: "purge-user",
                displayName: "purge-user",
                description: "Delete messages targeting a user",
                displayDescription: "Delete messages targeting a user",
                type: 1 as any, // SUB_COMMAND
                options: [
                    {
                        name: "user",
                        displayName: "user",
                        description: "Target user",
                        displayDescription: "Target user",
                        required: true,
                        type: 6 as any, // USER
                    },
                    {
                        name: "count",
                        displayName: "count",
                        description: "Max messages to scan (1-100)",
                        displayDescription: "Max messages to scan (1-100)",
                        required: false,
                        type: 4 as any, // INTEGER
                    },
                ],
            },
        ],
        execute: async (args: any[], ctx: any) => {
            const channelId = ctx.channel?.id;
            if (!channelId) return { content: "❌ No channel context." };

            // Try to get our own user ID from the token/API
            let ownId = "";
            try {
                const me = await discordApi("GET", "/users/@me");
                ownId = me?.id || "";
            } catch (e) {
                logger.error("[Nether] Failed to get own user:", e);
            }

            if (!ownId) return { content: "❌ Could not determine your user ID." };

            const sub = args[0];
            if (sub?.name === "purge") {
                const count = Math.min(Math.max(sub.options?.[0]?.value || 5, 1), 100);

                const doPurge = () => {
                    showToast(`🔄 Purging ${count} messages...`);
                    fetchChannelMessages(channelId, count).then((msgs) => {
                        const ownMsgs = msgs.filter((m: any) => m.author.id === ownId);
                        const ids = ownMsgs.map((m: any) => m.id);

                        if (ids.length === 0) {
                            showToast("✅ No messages to delete.");
                            return;
                        }

                        purgeMessages(channelId, ids).then(() => {
                            showToast(`✅ Deleted ${ids.length} messages.`);
                        }).catch((e) => {
                            showToast(`❌ Purge failed: ${e.message}`);
                            logger.error("[Nether] Purge error:", e);
                        });
                    }).catch((e) => {
                        showToast(`❌ Failed to fetch messages: ${e.message}`);
                    });
                };

                if (getStorage().purgeConfirm) {
                    showConfirmationAlert({
                        title: "Purge Messages",
                        content: `Delete your last ${count} messages?`,
                        confirmText: "Purge",
                        confirmColor: "red" as any,
                        onConfirm: doPurge,
                        cancelText: "Cancel",
                    });
                } else {
                    doPurge();
                }

                return { content: `🗑️ Purging ${count} messages...` };
            }

            if (sub?.name === "purge-user") {
                const userId = sub.options?.[0]?.value;
                const count = Math.min(Math.max(sub.options?.[1]?.value || 25, 1), 100);

                showToast(`🔄 Searching last ${count} messages...`);
                try {
                    const msgs = await fetchChannelMessages(channelId, count);
                    const ids = msgs
                        .filter((m: any) => {
                            if (m.author.id !== ownId) return false;
                            // Check if message mentions the target user
                            if (m.mentions?.some((u: any) => u.id === userId)) return true;
                            if (m.content?.includes(`<@${userId}>`)) return true;
                            return false;
                        })
                        .map((m: any) => m.id);

                    if (ids.length === 0) {
                        return { content: "✅ No matching messages found." };
                    }

                    await purgeMessages(channelId, ids);
                    return { content: `🗑️ Deleted ${ids.length} messages targeting that user.` };
                } catch (e: any) {
                    return { content: `❌ Failed: ${e.message}` };
                }
            }

            return { content: "Unknown command." };
        },
    });

    purgeLimiter = new RateLimiter(getStorage().purgeDelay);

    logger.log("[Nether] Purge initialized.");
    return () => {
        if (unregCommand) unregCommand();
        logger.log("[Nether] Purge unloaded.");
    };
}
