import { patcher } from "@vendetta";
import { showToast } from "@vendetta/ui/toasts";
import { storage } from "../storage";
import { logger } from "@vendetta";

// Experimental: Hook into Discord's notification handling
// This attempts to intercept notifications that get suppressed when
// the account is "online" on another device, and surface them as toasts.
export function initNotifications(): () => void {
    let unpatch: (() => void) | null = null;

    try {
        const { findByProps } = require("@vendetta/metro");
        // Try to find the notification dispatcher or push notification handler
        // This is highly version-dependent and may not work on all Discord versions

        unpatch = patcher.after("dispatch", require("@vendetta/metro/common").FluxDispatcher, (args: any[]) => {
            const action = args[0];
            if (!storage.notifBypassEnabled) return;

            // Look for notification-related events
            if (
                action?.type === "NOTIFICATION_CREATE" ||
                action?.type === "NOTIFICATION_DELETE"
            ) {
                logger.log("[Nether] Notif event intercepted:", action.type);
                if (action.type === "NOTIFICATION_CREATE" && action.notification) {
                    showToast(`🔔 ${action.notification?.body || "New notification"}`);
                }
            }
        });
    } catch (e) {
        logger.warn("[Nether] Notification bypass init failed (expected on some versions):", e);
    }

    logger.log("[Nether] Notification bypass initialized (experimental).");
    return () => {
        if (unpatch) unpatch();
        logger.log("[Nether] Notification bypass unloaded.");
    };
}
