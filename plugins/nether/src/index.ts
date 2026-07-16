import { logger } from "@vendetta";
import { initStorage, getStorage } from "./storage";
import { loadSettings } from "./Settings";
import Settings from "./Settings";
import { initFAB, fabEnabled } from "./fab";

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
import { navigation, React } from "@vendetta/metro/common";
import { showCustomAlert } from "@vendetta/ui/alerts";

let unloads: (() => void)[] = [];
let settingsOpen = false;

function openSettings() {
    if (settingsOpen) return;
    settingsOpen = true;
    showCustomAlert(Settings, {});
    // Unfortunately showCustomAlert may not close properly,
    // so we'll use the settings export as fallback for plugin config
}

export default {
    onLoad: async () => {
        logger.log("[Nether] Loading...");
        await initStorage();
        loadSettings();
        logger.log("[Nether] Storage initialized.");

        // FAB — draggable button in server list
        unloads.push(initFAB(() => {
            try {
                showCustomAlert(Settings, {});
            } catch {
                logger.log("[Nether] Settings opened via plugin config.");
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

        logger.log("[Nether] All modules loaded.");
    },

    onUnload: () => {
        logger.log("[Nether] Unloading...");
        unloads.forEach((fn) => {
            try { fn(); } catch (e) { logger.error("[Nether] Unload error:", e); }
        });
        unloads = [];
        settingsOpen = false;
        logger.log("[Nether] Unloaded.");
    },

    settings: Settings,
};
