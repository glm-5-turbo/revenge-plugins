import { patcher } from "@vendetta";
import { FluxDispatcher } from "@vendetta/metro/common";
import { discordApi } from "../utils";
import { storage } from "../storage";
import { logger } from "@vendetta";

export function initAutoReact(): () => void {
    const unpatch = patcher.after("dispatch", FluxDispatcher, async (args: any[]) => {
        const action = args[0];
        if (!storage.autoReactEnabled) return;
        // Only react to specific message types from known users
        // This is a placeholder — UI for configuring emoji/channel/user not built yet
    });

    logger.log("[Nether] Auto-react initialized (placeholder).");
    return () => {
        unpatch();
        logger.log("[Nether] Auto-react unloaded.");
    };
}