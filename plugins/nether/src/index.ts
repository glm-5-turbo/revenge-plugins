import { logger } from "@vendetta";
import { initStorage } from "./storage";
import Settings from "./Settings";

import { initAntiLog } from "./antilog";
import { initMessageLogger } from "./antilog/message-logger";
import { initGhostPings } from "./tweaks/ghost-pings";
import { initSpamGuard } from "./tweaks/spam-guard";
import { initFilters } from "./tweaks/filters";
import { initDebug } from "./debug";

let unloads: (() => void)[] = [];

export default {
    onLoad: () => {
        logger.log("[Nether] Loading...");
        initStorage();

        // Anti-Log — blocks Discord dispatches so typing/read/purge aren't broadcast
        unloads.push(initAntiLog());
        unloads.push(initMessageLogger());

        // Chat Tweaks — ghost ping detection, spam suppression, message filtering
        unloads.push(initGhostPings());
        unloads.push(initSpamGuard());
        unloads.push(initFilters());

        // Debug — logs all FluxDispatcher actions when enabled
        unloads.push(initDebug());

        logger.log("[Nether] All modules loaded.");
    },

    onUnload: () => {
        logger.log("[Nether] Unloading...");
        unloads.forEach((fn) => {
            try { fn(); } catch (e) { logger.error("[Nether] Unload error:", e); }
        });
        unloads = [];
        logger.log("[Nether] Unloaded.");
    },

    settings: Settings,
};