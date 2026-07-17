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
 * Get the Discord auth token via Discord's internal module.
 *
 * This uses findByProps("getToken") which is confirmed working
 * on Revenge (nexpid's customrpc plugin uses it successfully).
 * Discord mobile obfuscates some module property names but
 * "getToken" is a function reference that survives minification
 * because it's called internally by Discord's own code.
 */
export function getToken(): string {
    try {
        const { findByProps } = require("@vendetta/metro");
        const mod = findByProps("getToken");
        const token = mod?.getToken?.();
        if (typeof token === "string" && token.length > 50) return token;
    } catch (e) {
        logger.error("[Nether] getToken via findByProps failed:", e);
    }

    // Fallback: try to find it via the HTTP module
    try {
        const { findByProps } = require("@vendetta/metro");
        const httpMod = findByProps("get", "post");
        if (httpMod && typeof httpMod.getToken === "function") {
            const token = httpMod.getToken();
            if (typeof token === "string" && token.length > 50) return token;
        }
    } catch {}

    // Fallback: hook XMLHttpRequest to capture Authorization header
    // This catches the token from Discord's own outgoing requests
    try {
        const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
        let capturedToken = "";
        XMLHttpRequest.prototype.setRequestHeader = function(name: string, value: string) {
            if (name.toLowerCase() === "authorization" && value.length > 50) {
                capturedToken = value;
            }
            return origSetHeader.call(this, name, value);
        };
        // Trigger a request that will use auth — just hook and wait
        // The token should be captured on the next Discord API call
        setTimeout(() => {
            XMLHttpRequest.prototype.setRequestHeader = origSetHeader;
        }, 5000);
        if (capturedToken) return capturedToken;
    } catch {}

    return "";
}

/**
 * Make an authenticated Discord API request.
 *
 * Uses Approach 1 (Discord's native HTTP module) when possible,
 * falling back to safeFetch + manual auth header.
 */
let _discordHttp: any = null;

function getDiscordHttp(): any {
    if (!_discordHttp) {
        try {
            const { findByProps } = require("@vendetta/metro");
            _discordHttp = findByProps("get", "post", "put", "patch", "delete");
        } catch {}
    }
    return _discordHttp;
}

export async function discordApi(method: string, path: string, body?: unknown): Promise<any> {
    const url = path.startsWith("http") ? path : `https://discord.com/api/v9${path}`;

    // Try using Discord's native HTTP module first (handles auth + token refresh automatically)
    const http = getDiscordHttp();
    if (http && typeof http[method.toLowerCase()] === "function") {
        try {
            const res = await http[method.toLowerCase()](url, body ? { body } : undefined);
            return res?.body ?? res;
        } catch (e: any) {
            // If it fails with network error, fall through to manual approach
            logger.error("[Nether] Discord HTTP module failed, falling back:", e);
        }
    }

    // Fallback: manual auth via getToken() + fetch
    const { findByProps } = require("@vendetta/metro");
    const { getToken } = findByProps("getToken");
    const token = getToken?.();
    if (!token || token.length < 50) throw new Error("Could not find Discord auth token");

    const res = await fetch(url, {
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

export function getOwnUserId(): string {
    try {
        const { findByStoreName } = require("@vendetta/metro");
        const UserStore = findByStoreName("UserStore");
        return UserStore?.getCurrentUser()?.id || "";
    } catch {
        return "";
    }
}

export function uid(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}