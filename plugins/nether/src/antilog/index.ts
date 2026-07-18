import { initAntiTyping } from "./typing";
import { initAntiRead } from "./read-receipts";
import { initAntiPurgeLog } from "./anti-purge-log";
import { initAntiLogKeep } from "./anti-log-keep";
import { initAntiLogNonce } from "./anti-log-nonce";
import { logger } from "@vendetta";

export function initAntiLog(): () => void {
    const unloads: (() => void)[] = [];
    unloads.push(initAntiTyping());
    unloads.push(initAntiRead());
    unloads.push(initAntiPurgeLog());
    unloads.push(initAntiLogKeep());
    unloads.push(initAntiLogNonce());

    logger.log("[Nether] Anti-log modules initialized.");
    return () => {
        unloads.forEach((fn) => fn());
        logger.log("[Nether] Anti-log unloaded.");
    };
}