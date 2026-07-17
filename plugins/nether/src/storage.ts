import { storage } from "@vendetta/plugin";

const defaults = {
    // Anti-Log — all work via FluxDispatcher patching
    antiTyping: false,
    antiRead: false,
    antiPurgeLog: false,
    messageLogger: false,

    // Chat Tweaks — all work via FluxDispatcher patching
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