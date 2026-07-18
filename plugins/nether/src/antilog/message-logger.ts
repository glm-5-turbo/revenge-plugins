import { patcher } from "@vendetta";
import { findByProps, findByStoreName } from "@vendetta/metro";
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
    // Update if exists, append if not (so edits update cache content too)
    const existing = ch.find((m) => m.id === msg.id);
    if (existing) {
        existing.content = msg.content;
        existing.authorName = msg.authorName || existing.authorName;
        return;
    }
    ch.push(msg);
    if (ch.length > MAX_PER_CHANNEL) cache[msg.channelId] = ch.slice(-MAX_PER_CHANNEL);
}

function getCached(channelId: string, messageId: string): CachedMessage | undefined {
    return cache[channelId]?.find((m) => m.id === messageId);
}

// ===== Toast formatting (multi-line with author + content on separate lines) =====

function preview(s: string, n: number): string {
    // Strip newlines so the toast stays a clean one-liner per cell
    const flat = s.replace(/\s+/g, " ").trim();
    return flat.length > n ? flat.slice(0, n) + "…" : flat;
}

function toastDeletedBy(authorName: string, content: string): void {
    showToast(`🗑️  Deleted message\n👤 ${authorName}\n“${preview(content, 120)}”`);
}

function toastSilentDelete(authorName: string, content: string): void {
    showToast(`🕵️  Silent delete (no event)\n👤 ${authorName}\n“${preview(content, 120)}”`);
}

function toastEdited(authorName: string, oldContent: string, newContent: string): void {
    showToast(
        `✏️  Edited message\n👤 ${authorName}\n` +
        `− “${preview(oldContent, 60)}”\n` +
        `+ “${preview(newContent, 60)}”`
    );
}

function toastBulkDeleted(count: number): void {
    showToast(`🗑️  Bulk delete\n${count} message${count === 1 ? "" : "s"} removed`);
}

// ===== Row highlighting (red for deleted, blue for edited, with edit history) =====

let unpatchRows: (() => void) | null = null;

const RED_BG = "#da373c22";     // ~13% opacity danger red
const RED_GUTTER = "#da373cff";  // solid red
const BLUE_BG = "#2f6feb22";
const BLUE_GUTTER = "#2f6febff";

const EDIT_SEPARATOR = "`[ EDITED ]`"; // Discord renders backticks as inline code

function patchRowManager(): void {
    try {
        const gen = findByProps("generate", "updateRows") as any;
        if (!gen?.generate) {
            logger.log("[Nether] RowManager.generate not found — edit/deleted row highlighting unavailable");
            return;
        }

        unpatchRows = patcher.after("generate", gen, (_args: any[], ret: any) => {
            if (!storage.messageLogger) return ret;
            const rows: any[] = Array.isArray(ret) ? ret : ret?.rows ?? [];
            for (const row of rows) {
                const msg = row?.message;
                if (!msg?.id || !msg?.channel_id) continue;
                const key = `${msg.channel_id}:${msg.id}`;

                if (confirmedDeletes.has(key) || msg.__vml_deleted) {
                    // Set row-level props for the renderer to pick up
                    if (row.style && typeof row.style === "object") {
                        row.style = { ...row.style, opacity: 0.6 };
                    }
                    row.backgroundHighlight = { backgroundColor: RED_BG, gutterColor: RED_GUTTER };
                    msg.edited = "deleted";
                    msg.__vml_deleted = true;
                }

                const edits = editHistory[key];
                if (edits && edits.length > 0 && !msg.__vml_deleted) {
                    row.backgroundHighlight = { backgroundColor: BLUE_BG, gutterColor: BLUE_GUTTER };
                    msg.edited = `edited (${edits.length})`;
                    // Render edit history inline below the current content.
                    // Note: this mutates the store message content directly, which
                    // works because the row generator reads msg.content each pass.
                    if (storage.messageLoggerShowHistory && typeof msg.content === "string") {
                        const history = edits
                            .map((e) => preview(e.content, 200))
                            .join(`\n${EDIT_SEPARATOR}\n`);
                        msg.content = `${history}\n${EDIT_SEPARATOR}\n${msg.content}`;
                    }
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
            // Use the already-imported findByStoreName
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
                    toastSilentDelete(c.authorName, c.content);
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
            addMessage({
                id: m.id, channelId: m.channel_id,
                authorId: m.author?.id || "",
                authorName: m.author?.username || "Unknown",
                content: m.content || "",
                timestamp: m.timestamp || "",
            });
        }
    });

    const unpatchDelete = patcher.after("dispatch", FluxDispatcher, (args: any[]) => {
        const action = args[0];
        if (!storage.messageLogger) return;

        // Support both channelId (camelCase, mobile) and channel_id (snake_case)
        const channelId = action.channel_id ?? action.channelId;
        const msgId = action.id;

        if (action?.type === "MESSAGE_DELETE") {
            const key = `${channelId}:${msgId}`;
            confirmedDeletes.add(key);
            const cached = getCached(channelId, msgId);
            if (cached) toastDeletedBy(cached.authorName, cached.content);
        }

        if (action?.type === "MESSAGE_DELETE_BULK") {
            const ids: string[] = action.ids || [];
            for (const id of ids) confirmedDeletes.add(`${channelId}:${id}`);
            toastBulkDeleted(ids.length);
        }
    });

    const unpatchUpdate = patcher.after("dispatch", FluxDispatcher, (args: any[]) => {
        const action = args[0];
        if (!storage.messageLogger) return;
        if (action?.type === "MESSAGE_UPDATE" && action.message) {
            const msgId = action.message.id;
            const channelId = action.message.channel_id ?? action.message.channelId;
            const key = `${channelId}:${msgId}`;

            // Handle __vml_deleted marker (from anti-purge-log conversion)
            if (action.message.__vml_deleted) {
                confirmedDeletes.add(key);
                return;
            }

            const cached = getCached(channelId, msgId);
            const newContent = action.message.content;
            if (cached && typeof newContent === "string" && newContent !== cached.content) {
                if (!editHistory[key]) editHistory[key] = [];
                editHistory[key].push({ content: cached.content, editedAt: Date.now() });
                if (editHistory[key].length > 10) editHistory[key] = editHistory[key].slice(-10);
                toastEdited(cached.authorName, cached.content, newContent);
                // Update cache with the new content so the next edit diff is correct
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