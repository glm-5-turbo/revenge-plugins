import { findByProps, findByStoreName } from "@vendetta/metro";
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
 * Uses findByProps("getToken") which is confirmed working
 * on Revenge (nexpid's customrpc plugin uses it successfully).
 */
export function getToken(): string {
    try {
        const mod = findByProps("getToken") as any;
        const token = mod?.getToken?.();
        if (typeof token === "string" && token.length > 50) return token;
    } catch (e) {
        logger.error("[Nether] getToken failed:", e);
    }

    // Fallback: try HTTP module which sometimes carries getToken
    try {
        const httpMod = findByProps("get", "post") as any;
        if (httpMod && typeof httpMod.getToken === "function") {
            const token = httpMod.getToken();
            if (typeof token === "string" && token.length > 50) return token;
        }
    } catch {}

    return "";
}

/**
 * Make an authenticated Discord API request.
 *
 * Tries Discord's native HTTP module first (auth handled automatically),
 * falls back to getToken() + fetch.
 */
export async function discordApi(method: string, path: string, body?: unknown): Promise<any> {
    const url = path.startsWith("http") ? path : `https://discord.com/api/v9${path}`;

    // Try using Discord's native HTTP module (handles auth + token refresh automatically)
    try {
        const httpMod = findByProps("get", "post", "put", "patch", "delete") as any;
        const httpFn = httpMod?.[method.toLowerCase()];
        if (typeof httpFn === "function") {
            const res = await httpFn(url, body ? { body } : undefined);
            return res?.body ?? res;
        }
    } catch (e: any) {
        logger.error("[Nether] Discord HTTP module failed:", e);
    }

    // Fallback: manual auth via getToken() + fetch
    const token = getToken();
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
        const UserStore = findByStoreName("UserStore") as any;
        return UserStore?.getCurrentUser()?.id || "";
    } catch {
        return "";
    }
}

export function uid(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}