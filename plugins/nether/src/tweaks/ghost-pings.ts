import { patcher } from "@vendetta";
import { FluxDispatcher } from "@vendetta/metro/common";
import { showToast } from "@vendetta/ui/toasts";
import { findByProps } from "@vendetta/metro";
import { storage } from "../storage";
import { logger } from "@vendetta";

export function initGhostPings(): () => void {
    let ownUserId = "";

    try {
        const UserStore = findByProps("getCurrentUser");
        ownUserId = UserStore?.getCurrentUser()?.id || "";
    } catch { /* empty */ }

    const unpatchDelete = patcher.after("dispatch", FluxDispatcher, (args: any[]) => {
        const action = args[0];
        if (!storage.ghostPings) return;

        if (action?.type === "MESSAGE_DELETE" && action.message?.author) {
            const m = action.message;
            if (!ownUserId) return;

            const wasMentioned =
                m.content?.includes(`<@${ownUserId}>`) ||
                m.content?.includes(`<@!${ownUserId}>`) ||
                m.content?.includes(`<@&${ownUserId}>`) ||
                m.mentions?.some((u: any) => u.id === ownUserId);

            if (wasMentioned) {
                showToast(
                    `👻 Ghost ping from **${m.author?.username || "Unknown"}**: "${m.content?.slice(0, 80) || "(no content)"}"`
                );
            }
        }

        // Also catch MESSAGE_UPDATE where mentions are removed (edit-unping)
        if (action?.type === "MESSAGE_UPDATE" && action.message?.content) {
            const m = action.message;
            if (!ownUserId) return;

            const hadMention =
                m.content?.includes(`<@${ownUserId}>`) ||
                m.content?.includes(`<@!${ownUserId}>`);

            // Check if the "old" content (which we'd need from message logger cache) had a mention
            // For now, we just detect if the new content still has a mention
            // This is a simplified version — full version would need the message logger cache
        }
    });

    logger.log("[Nether] Ghost pings initialized.");
    return () => {
        unpatchDelete();
        logger.log("[Nether] Ghost pings unloaded.");
    };
}
