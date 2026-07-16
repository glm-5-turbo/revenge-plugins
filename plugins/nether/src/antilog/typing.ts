import { patcher } from "@vendetta";
import { FluxDispatcher } from "@vendetta/metro/common";
import { getStorage } from "../storage";
import { logger } from "@vendetta";

export function initAntiTyping(): () => void {
    // Intercept outgoing TYPING_START events so they never reach the server
    const unpatch = patcher.before("dispatch", FluxDispatcher, (args: any[]) => {
        const action = args[0];
        if (action?.type === "TYPING_START" && getStorage().antiTyping) {
            // Swallow the event — don't dispatch it
            args[0] = { type: "__NETHER_BLOCKED__" };
        }
    });

    return () => {
        unpatch();
        logger.log("[Nether] Anti-typing unloaded.");
    };
}
