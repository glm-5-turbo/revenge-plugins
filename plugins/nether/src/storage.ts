import { createMMKVBackend, createStorage, wrapSync, createProxy, awaitSyncWrapper } from "@vendetta/storage";

export interface NetherSettings {
    antiTyping: boolean;
    antiRead: boolean;
    antiPurgeLog: boolean;
    messageLogger: boolean;
    purgeDelay: number;
    purgeConfirm: boolean;
    afkEnabled: boolean;
    afkMessage: string;
    afkDelay: number;
    schedulerEnabled: boolean;
    autoReactEnabled: boolean;
    autoReactRules: any[];
    notifBypassEnabled: boolean;
    ghostPings: boolean;
    spamGuardEnabled: boolean;
    spamGuardThreshold: number;
    spamGuardCooldown: number;
    filtersEnabled: boolean;
    filterRules: any[];
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
    let raw: NetherSettings;
    try {
        const result = await createStorage<NetherSettings>(backend);
        wrapSync(result);
        raw = result as unknown as NetherSettings;
    } catch {
        raw = { ...defaults };
    }

    const merged = { ...defaults, ...raw };
    backend.set(merged);

    const { proxy } = createProxy(merged);
    storage = proxy;
}

export function getStorage(): NetherSettings {
    return storage;
}

export { storage as default };
