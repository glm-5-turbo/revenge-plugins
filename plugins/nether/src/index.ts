import { logger } from "@vendetta";
import { initStorage } from "./storage";
import Settings from "./Settings";

import { initAntiLog } from "./antilog";
import { initMessageLogger } from "./antilog/message-logger";
import { initPurge } from "./purge";
import { initAFK } from "./automation/afk";
import { initAutoReact } from "./automation/auto-react";
import { initGhostPings } from "./tweaks/ghost-pings";
import { initSpamGuard } from "./tweaks/spam-guard";
import { initFilters } from "./tweaks/filters";
import { initDebug } from "./debug";

let unloads: (() => void)[] = [];

export default {
    onLoad: () => {
        logger.log("[Nether] Loading...");
        initStorage();

        // Anti-Log
        unloads.push(initAntiLog());
        unloads.push(initMessageLogger());

        // Purge
        unloads.push(initPurge());

        // Automation
        unloads.push(initAFK());
        unloads.push(initAutoReact());

        // Chat Tweaks
        unloads.push(initGhostPings());
        unloads.push(initSpamGuard());
        unloads.push(initFilters());

        // Debug
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