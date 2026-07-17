import { safeFetch, findByProps } from "@vendetta";
import { logger } from "@vendetta";

export class RateLimiter {
    private queue: (() => Promise<void>)[] = [];
    private running = false;
    private lastRun = 0;
    public interval: number;

    constructor(interval: number = 500) {
        this.interval = interval;
    }

    async add(fn: () => Promise<void>): Promise<void> {
        return new Promise<void>((resolve) => {
            this.queue.push(async () => {
                try { await fn(); } catch (e) { logger.error("RateLimiter task failed:", e); }
                resolve();
            });
            this.process();
        });
    }

    private async process(): Promise<void> {
        if (this.running) return;
        this.running = true;
        while (this.queue.length > 0) {
            const now = Date.now();
            const elapsed = now - this.lastRun;
            if (elapsed < this.interval) await sleep(this.interval - elapsed);
            const task = this.queue.shift()!;
            await task();
            this.lastRun = Date.now();
        }
        this.running = false;
    }
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Find the Discord auth token by scanning ALL metro modules.
 * Discord mobile obfuscates module names so findByProps("getToken")
 * doesn't always work. This tries every strategy.
 */
export function getToken(): string {
    // Strategy 1: known property names
    const knownProps = [
        "getToken",
        "getSuperProperties",
        "setToken",
        "authorization",
        "Authorization",
        "PREFIX",
        "BOT_TOKEN",
    ];

    // Try common combinations
    const searches = [
        () => findByProps("getToken")?.getToken?.(),
        () => findByProps("getToken", "getSuperProperties")?.getToken?.(),
        () => findByProps("getSuperProperties", "getToken")?.getToken?.(),
        () => findByProps("setToken", "getToken")?.getToken?.(),
        () => findByProps("getToken", "setToken")?.getToken?.(),
    ];

    for (const s of searches) {
        try { const t = s(); if (typeof t === "string" && t.length > 50) return t; } catch {}
    }

    // Strategy 2: find a module that has a "getToken" function by name
    try {
        const { findByName } = require("@vendetta/metro");
        const mod = findByName("getToken", false);
        if (mod?.() && typeof mod() === "string" && mod().length > 50) return mod();
    } catch {}

    // Strategy 3: scan ALL module exports for token-like strings
    // Discord token format: mfa.xxx or xxx.yyy.zzz (base64 triples)
    try {
        const modules = (window as any).modules || {};
        const allKeys = Object.keys(modules);
        // Only scan first 200 modules to avoid performance hit
        const scanLimit = Math.min(allKeys.length, 200);
        for (let i = 0; i < scanLimit; i++) {
            const mod = modules[allKeys[i]]?.publicModule?.exports;
            if (!mod || typeof mod !== "object") continue;
            try {
                const str = JSON.stringify(mod);
                // Discord tokens: MFA or regular format
                const match = str.match(/"(mfa\.[A-Za-z0-9_-]{20,})"/);
                if (match) return match[1];
                // Non-MFA: two parts separated by dots, looking like a JWT
                const match2 = str.match(/"([A-Za-z0-9_-]{23,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{27,})"/);
                if (match2) return match2[1];
            } catch {}
        }
    } catch {}

    // Strategy 4: check ReactNative AsyncStorage or similar
    try {
        const { ReactNative } = require("@vendetta/metro/common");
        if (ReactNative?.AsyncStorage) {
            // Can't easily read AsyncStorage sync, but worth a shot
        }
    } catch {}

    // Strategy 5: check the window.vendetta object for any stored auth
    try {
        const v = (window as any).vendetta;
        if (v?.settings) {
            const str = JSON.stringify(v.settings);
            const match = str.match(/"(mfa\.[A-Za-z0-9_-]{20,})"/);
            if (match) return match[1];
            const match2 = str.match(/"([A-Za-z0-9_-]{23,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{27,})"/);
            if (match2) return match2[1];
        }
    } catch {}

    // Strategy 6: check Discord's HTTP request headers by intercepting a stored config
    try {
        const httpMod = findByProps("get", "post", "put", "patch", "delete");
        if (httpMod && typeof httpMod === "object") {
            const str = JSON.stringify(httpMod);
            const match = str.match(/"(mfa\.[A-Za-z0-9_-]{20,})"/);
            if (match) return match[1];
            const match2 = str.match(/"([A-Za-z0-9_-]{23,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{27,})"/);
            if (match2) return match2[1];
        }
    } catch {}

    return "";
}

export async function discordApi(method: string, path: string, body?: unknown): Promise<any> {
    const token = getToken();
    if (!token) throw new Error("Could not find Discord auth token");

    const url = path.startsWith("http") ? path : `https://discord.com/api/v10${path}`;
    const res = await safeFetch(url, {
        method,
        headers: {
            Authorization: token,
            "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`API ${res.status}: ${text.slice(0, 100)}`);
    }

    return res.json().catch(() => null);
}

export function uid(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}