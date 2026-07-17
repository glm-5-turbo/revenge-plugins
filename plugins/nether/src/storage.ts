import { storage } from "@vendetta/plugin";

const defaults = {
    // Anti-Log — works via FluxDispatcher patching
    antiTyping: false,
    antiRead: false,
    antiPurgeLog: false,
    antiPurgeLogMessage: "‎",
    messageLogger: false,

    // Purge — works via API (if token found)
    purgeDelay: 100,
    purgeConfirm: true,

    // Auto-Delete (Telegram-style) — works via API
    autoDeleteEnabled: false,
    autoDeleteDelay: 86400000, // 24 hours in ms
    autoDeleteChannels: [], // empty = all channels

    // AFK — works via API (if token found)
    afkEnabled: false,
    afkMessage: "I'm currently AFK. I'll get back to you later.",
    afkDelay: 3000,

    // Auto-react — works via API (if token found)
    autoReactEnabled: false,
    autoReactEmoji: "✅",

    // Chat Tweaks — works via FluxDispatcher patching
    ghostPings: true,
    spamGuardEnabled: false,
    spamGuardThreshold: 10,
    spamGuardCooldown: 60000,
    filtersEnabled: false,

    // Dev
    debugMode: false,
};

export function initStorage() {
    for (const [key, val] of Object.entries(defaults)) {
        if ((storage as any)[key] === undefined) {
            (storage as any)[key] = val;
        }
    }
}

export { storage };