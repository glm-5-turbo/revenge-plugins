import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";

export interface AutoReactRule {
    channelId?: string;
    userId?: string;
    emoji: string;
}

export interface FilterRule {
    type: "user" | "regex" | "bot";
    value: string;
}

const defaults = {
    antiTyping: false,
    antiRead: false,
    antiPurgeLog: false,
    messageLogger: false,
    purgeDelay: 500,
    purgeConfirm: true,
    afkEnabled: false,
    afkMessage: "I'm currently AFK. I'll get back to you later.",
    afkDelay: 3000,
    schedulerEnabled: false,
    autoReactEnabled: false,
    autoReactRules: [] as AutoReactRule[],
    notifBypassEnabled: false,
    ghostPings: true,
    spamGuardEnabled: false,
    spamGuardThreshold: 10,
    spamGuardCooldown: 60000,
    filtersEnabled: false,
    filterRules: [] as FilterRule[],
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