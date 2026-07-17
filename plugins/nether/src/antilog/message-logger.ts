import { patcher, findByProps } from "@vendetta";
import { FluxDispatcher } from "@vendetta/metro/common";
import { showToast } from "@vendetta/ui/toasts";
import { storage } from "../storage";
import { logger } from "@vendetta";

interface CachedMessage {
    id: string;
    channelId: string;
    authorId: string;
    authorName: string;
    content: string;
    timestamp: string;
}

const MAX_PER_CHANNEL = 500;
const cache: Record<string, CachedMessage[]> = {};
const confirmedDeletes = new Set<string>();
const notifiedMessages = new Set<string>();

interface EditRecord { content: string; editedAt: number; }
const editHistory: Record<string, EditRecord[]> = {};

let pollInterval: ReturnType<typeof setInterval> | null = null;
const POLL_MS = 8_000;

// ===== Cache helpers =====

function addMessage(msg: CachedMessage): void {
    if (!cache[msg.channelId]) cache[msg.channelId] = [];
    const ch = cache[msg.channelId];
    if (ch.find((m) => m.id === msg.id)) return;
    ch.push(msg);
    if (ch.length > MAX_PER_CHANNEL) cache[msg.channelId] = ch.slice(-MAX_PER_CHANNEL);
}

function getCached(channelId: string, messageId: string): CachedMessage | undefined {
    return cache[channelId]?.find((m) => m.id === messageId);
}

// ===== Row highlighting (red for deleted, blue for edited) =====

let unpatchRows: (() => void) | null = null;

function patchRowManager(): void {
    try {
        const gen = findByProps("generate", "updateRows") as any;
        if (!gen?.generate) return;

        unpatchRows = patcher.after("generate", gen, (_args: any[], ret: any) => {
            if (!storage.messageLogger) return ret;
            const rows: any[] = Array.isArray(ret) ? ret : ret?.rows ?? [];
            for (const row of rows) {
                const msg = row?.message;
                if (!msg?.id || !msg?.channel_id) continue;
                const key = `${msg.channel_id}:${msg.id}`;

                if (confirmedDeletes.has(key) || msg.__vml_deleted) {
                    row.backgroundHighlight = { backgroundColor: "#da373c22", gutterColor: "#da373cff" };
                    msg.edited = "deleted";
                    msg.__vml_deleted = true;
                }

                const edits = editHistory[key];
                if (edits && edits.length > 0 && !msg.__vml_deleted) {
                    row.backgroundHighlight = { backgroundColor: "#2f6feb22", gutterColor: "#2f6febff" };
                    msg.edited = `edited (${edits.length})`;
                }
            }
            return ret;
        });
    } catch (e) {
        logger.error("[Nether] RowManager patch failed:", e);
    }
}

function unpatchRowManager(): void {
    if (unpatchRows) { unpatchRows(); unpatchRows = null; }
}

// ===== Silent delete detection =====

function startSilentDeleteDetector(): void {
    if (pollInterval) return;
    pollInterval = setInterval(() => {
        if (!storage.messageLogger) return;
        try {
            const { findByStoreName } = require("@vendetta/metro");
            const MS = findByStoreName("MessageStore") as any;
            if (!MS) return;
            for (const [channelId, msgs] of Object.entries(cache)) {
                const cachedMsgs = msgs as CachedMessage[];
                const chMsgs = MS.getMessages(channelId);
                if (!chMsgs) continue;
                for (const c of cachedMsgs) {
                    const key = `${channelId}:${c.id}`;
                    if (confirmedDeletes.has(key) || notifiedMessages.has(key)) continue;
                    if (chMsgs.get(c.id) != null) continue;
                    notifiedMessages.add(key);
                    confirmedDeletes.add(key);
                    showToast(`🕵️ Silent delete: "${c.content.slice(0, 80)}${c.content.length > 80 ? "..." : ""}" — ${c.authorName}`);
                }
            }
        } catch {}
    }, POLL_MS);
}

function stopSilentDeleteDetector(): void {
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
}

// ===== Main init =====

export function initMessageLogger(): () => void {
    patchRowManager();

    const unpatchCreate = patcher.after("dispatch", FluxDispatcher, (args: any[]) => {
        const action = args[0];
        if (!storage.messageLogger) return;
        if (action?.type === "MESSAGE_CREATE" && action.message) {
            const m = action.message;
            addMessage({ id: m.id, channelId: m.channel_id, authorId: m.author?.id || "", authorName: m.author?.username || "Unknown", content: m.content || "", timestamp: m.timestamp || "" });
        }
    });

    const unpatchDelete = patcher.after("dispatch", FluxDispatcher, (args: any[]) => {
        const action = args[0];
        if (!storage.messageLogger) return;
        if (action?.type === "MESSAGE_DELETE") {
            const key = `${action.channel_id}:${action.id}`;
            confirmedDeletes.add(key);
            const cached = getCached(action.channel_id, action.id);
            if (cached) showToast(`🗑️ Deleted by ${cached.authorName}: "${cached.content.slice(0, 80)}${cached.content.length > 80 ? "..." : ""}"`);
        }
        if (action?.type === "MESSAGE_DELETE_BULK") {
            const ids: string[] = action.ids || [];
            for (const id of ids) confirmedDeletes.add(`${action.channel_id}:${id}`);
            showToast(`🗑️ ${ids.length} messages bulk deleted`);
        }
    });

    const unpatchUpdate = patcher.after("dispatch", FluxDispatcher, (args: any[]) => {
        const action = args[0];
        if (!storage.messageLogger) return;
        if (action?.type === "MESSAGE_UPDATE" && action.message) {
            const msgId = action.message.id;
            const channelId = action.message.channel_id;
            const key = `${channelId}:${msgId}`;

            // Handle __vml_deleted marker (from anti-purge-log conversion)
            if (action.message.__vml_deleted) {
                confirmedDeletes.add(key);
                return;
            }

            const cached = getCached(channelId, msgId);
            const newContent = action.message.content;
            if (cached && newContent && newContent !== cached.content) {
                if (!editHistory[key]) editHistory[key] = [];
                editHistory[key].push({ content: cached.content, editedAt: Date.now() });
                if (editHistory[key].length > 10) editHistory[key] = editHistory[key].slice(-10);
                showToast(`✏️ ${cached.authorName} edited: "${cached.content.slice(0, 45)}" → "${newContent.slice(0, 45)}"`);
                addMessage({ ...cached, content: newContent });
            }
        }
    });

    startSilentDeleteDetector();

    logger.log("[Nether] Message logger initialized.");
    return () => {
        unpatchCreate(); unpatchDelete(); unpatchUpdate();
        unpatchRowManager(); stopSilentDeleteDetector();
        for (const k of Object.keys(cache)) delete cache[k];
        for (const k of Object.keys(editHistory)) delete editHistory[k];
        confirmedDeletes.clear(); notifiedMessages.clear();
        logger.log("[Nether] Message logger unloaded.");
    };
}