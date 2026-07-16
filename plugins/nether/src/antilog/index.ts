import { initAntiTyping } from "./typing";
import { initAntiRead } from "./read-receipts";
import { logger } from "@vendetta";

export function initAntiLog(): () => void {
    const unloads: (() => void)[] = [];
    unloads.push(initAntiTyping());
    unloads.push(initAntiRead());

    logger.log("[Nether] Anti-log modules initialized.");
    return () => {
        unloads.forEach((fn) => fn());
        logger.log("[Nether] Anti-log unloaded.");
    };
}
