import { safeFetch, findByProps } from "@vendetta";
import { logger } from "@vendetta";

// Rate limiter — Discord allows ~50 requests per second globally
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
                try {
                    await fn();
                } catch (e) {
                    logger.error("RateLimiter task failed:", e);
                }
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
            if (elapsed < this.interval) {
                await sleep(this.interval - elapsed);
            }
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

// Extract Discord token — tries known module locations
export function getToken(): string {
    // 1) RestClient.getToken (most common in Discord)
    try {
        const rest = findByProps("getToken");
        if (rest?.getToken?.()) {
            const token = rest.getToken();
            logger.log("[Nether] Token: found via findByProps(getToken)");
            return token;
        }
    } catch { logger.warn("[Nether] Token: method 1 (getToken prop) failed"); }

    // 2) HTTPClient.getToken
    try {
        const http = findByProps("getSuperProperties", "getToken");
        if (http?.getToken?.()) {
            const token = http.getToken();
            logger.log("[Nether] Token: found via HTTPClient.getToken");
            return token;
        }
    } catch { logger.warn("[Nether] Token: method 2 (HTTPClient.getToken) failed"); }

    // 3) API layer _token
    try {
        const api = findByProps("API", "api");
        if (api?.API?._token) {
            logger.log("[Nether] Token: found via API._token");
            return api.API._token;
        }
    } catch { logger.warn("[Nether] Token: method 3 (API._token) failed"); }

    // 4) Http module (found in some Revenge builds)
    try {
        const httpMod = findByProps("Http", "HTTP");
        if (httpMod?.Http?.getToken?.()) {
            const token = httpMod.Http.getToken();
            logger.log("[Nether] Token: found via Http.getToken");
            return token;
        }
    } catch { logger.warn("[Nether] Token: method 4 (Http module) failed"); }

    // 5) Socket / connection layer token
    try {
        const conn = findByProps("connect", "disconnect", "getToken");
        if (conn?.getToken?.()) {
            const token = conn.getToken();
            logger.log("[Nether] Token: found via connection.getToken");
            return token;
        }
    } catch { logger.warn("[Nether] Token: method 5 (connection token) failed"); }

    logger.warn("[Nether] Token: all 5 extraction methods failed");
    return "";
}

// Make an authenticated Discord REST API request
export async function discordApi(method: string, path: string, body?: unknown): Promise<any> {
    const token = getToken();
    if (!token) throw new Error("No Discord token available");

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
        throw new Error(`Discord API ${res.status}: ${text}`);
    }

    return res.json().catch(() => null);
}

export function uid(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}