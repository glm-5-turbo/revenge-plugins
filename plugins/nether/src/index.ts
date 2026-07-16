import { logger } from "@vendetta";
import { initStorage, getStorage } from "./storage";
import Settings from "./Settings";

import { initAntiLog } from "./antilog";
import { initMessageLogger } from "./antilog/message-logger";
import { initPurge } from "./purge";
import { initAFK } from "./automation/afk";
import { initScheduler } from "./automation/scheduler";
import { initAutoReact } from "./automation/auto-react";
import { initNotifications } from "./automation/notifications";
import { initGhostPings } from "./tweaks/ghost-pings";
import { initSpamGuard } from "./tweaks/spam-guard";
import { initFilters } from "./tweaks/filters";

let unloads: (() => void)[] = [];

export default {
    onLoad: async () => {
        logger.log("[Nether] Loading...");
        await initStorage();
        logger.log("[Nether] Storage initialized.");

        // Anti-Log
        unloads.push(initAntiLog());
        unloads.push(initMessageLogger());

        // Purge
        unloads.push(initPurge());

        // Automation
        unloads.push(initAFK());
        unloads.push(initScheduler());
        unloads.push(initAutoReact());
        unloads.push(initNotifications());

        // Chat Tweaks
        unloads.push(initGhostPings());
        unloads.push(initSpamGuard());
        unloads.push(initFilters());

        logger.log("[Nether] All modules loaded.");
    },

    onUnload: () => {
        logger.log("[Nether] Unloading...");
        unloads.forEach((fn) => {
            try {
                fn();
            } catch (e) {
                logger.error("[Nether] Error during unload:", e);
            }
        });
        unloads = [];
        logger.log("[Nether] Unloaded.");
    },

    settings: Settings,
};
