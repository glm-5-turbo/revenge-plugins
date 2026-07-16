import { createProxy, createMMKVBackend, awaitSyncWrapper } from "@vendetta/storage";

export interface NetherSettings {
    // Anti-Log
    antiTyping: boolean;
    antiRead: boolean;
    antiPurgeLog: boolean;
    messageLogger: boolean;

    // Purge
    purgeDelay: number;
    purgeConfirm: boolean;

    // Automation
    afkEnabled: boolean;
    afkMessage: string;
    afkDelay: number;
    schedulerEnabled: boolean;
    autoReactEnabled: boolean;
    autoReactRules: AutoReactRule[];
    notifBypassEnabled: boolean;

    // Tweaks
    ghostPings: boolean;
    spamGuardEnabled: boolean;
    spamGuardThreshold: number;
    spamGuardCooldown: number;
    filtersEnabled: boolean;
    filterRules: FilterRule[];
}

export interface AutoReactRule {
    id: string;
    channelId?: string;
    userId?: string;
    emoji: string;
}

export interface FilterRule {
    id: string;
    type: "user" | "regex" | "bot";
    value: string;
}

const defaults: NetherSettings = {
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
    autoReactRules: [],
    notifBypassEnabled: false,

    ghostPings: true,
    spamGuardEnabled: false,
    spamGuardThreshold: 10,
    spamGuardCooldown: 60000,
    filtersEnabled: false,
    filterRules: [],
};

let storage: NetherSettings;

export async function initStorage(): Promise<void> {
    const backend = createMMKVBackend("nether-settings");
    const raw = await createStorage<NetherSettings>(backend);
    await awaitSyncWrapper(raw);

    // Merge defaults for any missing keys
    const merged = { ...defaults, ...raw };
    backend.set(merged);

    const { proxy, emitter } = createProxy(merged as NetherSettings);
    storage = proxy;
    (storage as any)._emitter = emitter;
}

export function getStorage(): NetherSettings {
    return storage;
}

export { storage as default };
