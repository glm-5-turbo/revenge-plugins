import { logger } from "@vendetta";
import { initStorage } from "./storage";
import Settings from "./Settings";
import { initServerButton } from "./serverlist";

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
import { initDebug } from "./debug";
import { showCustomAlert } from "@vendetta/ui/alerts";

let unloads: (() => void)[] = [];

export default {
    onLoad: () => {
        logger.log("[Nether] Loading...");
        initStorage();

        // Server list button — tap to open settings
        unloads.push(initServerButton(() => {
            try {
                showCustomAlert(Settings, {});
            } catch (e) {
                logger.error("[Nether] Settings open failed:", e);
            }
        }));

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

        // Debug / Flux action logger
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