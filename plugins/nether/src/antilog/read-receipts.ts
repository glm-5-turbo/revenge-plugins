import { patcher } from "@vendetta";
import { FluxDispatcher } from "@vendetta/metro/common";
import { storage } from "../storage";
import { logger } from "@vendetta";

export function initAntiRead(): () => void {
    // Block dispatches that mark messages as read
    const unpatch = patcher.before("dispatch", FluxDispatcher, (args: any[]) => {
        const action = args[0];
        if (!storage.antiRead) return;

        // MESSAGE_ACK = server ack of read state
        // UPDATE_READ_STATE = client marking channel as read
        if (
            action?.type === "MESSAGE_ACK" ||
            action?.type === "UPDATE_READ_STATE" ||
            action?.type === "NOTIFICATION_SETTINGS_UPDATE"
        ) {
            args[0] = { type: "__NETHER_BLOCKED__" };
        }
    });

    return () => {
        unpatch();
        logger.log("[Nether] Anti-read unloaded.");
    };
}
