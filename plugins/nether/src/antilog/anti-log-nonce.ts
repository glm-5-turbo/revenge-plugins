import { patcher } from "@vendetta";
import { FluxDispatcher } from "@vendetta/metro/common";
import { findByStoreName, findByProps } from "@vendetta/metro";
import { storage } from "../storage";
import { discordApi, sleep } from "../utils";
import { showToast } from "@vendetta/ui/toasts";
import { logger } from "@vendetta";

/**
 * Anti-Log via Nonce Overlap
 *
 * Production technique from applefritter-inc/AntiLog (Vencord plugin).
 * Works on Discord Android mobile / Revenge too — the REST endpoint accepts
 * a `nonce` body field that can be set to any integer or string.
 *
 * How it works:
 *   1. Send a new message with `nonce = <original message ID>`
 *      → Discord's client-side render code overlaps the old message in-place,
 *        so any logger watching MESSAGE_CREATE sees the new message "replace"
 *        the old one in the Flux store.
 *   2. DELETE the original message → server removes it, MESSAGE_DELETE fires
 *   3. Wait 120ms (configurable)
 *   4. DELETE the decoy message → MESSAGE_DELETE fires for the decoy
 *
 * Net effect: any logger that was caching the original sees the block content
 * (or empty) instead, and both deletes propagate. The original content is
 * never visible to a logger that captured the overlap.
 *
 * Known counter: Vencord's MessageLogger has a `normalizeNonce` that strips
 * the nonce on receiveMessage when IDs differ — defeating the overlap.
 * Nether users should know this may not defeat hardened loggers.
 *
 * Configuration:
 *   storage.antiLogNonce - master toggle (default false)
 *   storage.antiLogNonceBlock - the block content sent as decoy (default "")
 *   storage.antiLogNonceDelay - ms to wait between delete steps (default 120)
 */

let ownUserId = "";

export function initAntiLogNonce(): () => void {
    try {
        const UserStore = findByStoreName("UserStore") as any;
        ownUserId = UserStore?.getCurrentUser()?.id || "";
    } catch {}

    const unpatch = patcher.after("dispatch", FluxDispatcher, async (args: any[]) => {
        if (!storage.antiLogNonce) return;

        const action = args[0];
        if (!action || action.type !== "MESSAGE_DELETE") return;

        const channelId = action.channel_id ?? action.channelId;
        const msgId = action.id;
        if (!channelId || !msgId) return;

        // Find the message in MessageStore to confirm it's ours
        const MessageStore = findByStoreName("MessageStore") as any;
        if (!MessageStore?.getMessages) return;
        const store = MessageStore.getMessages(channelId);
        const msg = store?.get(msgId);
        if (!msg || msg.author?.id !== ownUserId) return;

        // Run the nonce-overlap trick asynchronously (don't block the dispatch)
        nonceOverlap(channelId, msgId).catch((e) => {
            logger.error("[Nether] Nonce anti-log failed:", e);
        });
    });

    logger.log("[Nether] Anti-log nonce initialized.");
    return () => {
        unpatch();
        logger.log("[Nether] Anti-log nonce unloaded.");
    };
}

async function nonceOverlap(channelId: string, originalMsgId: string): Promise<void> {
    const blockText = storage.antiLogNonceBlock || "";
    const delay = storage.antiLogNonceDelay ?? 120;

    try {
        // Step 1: Send decoy with nonce = original ID
        // The REST POST accepts nonce in the body. We use our existing
        // discordApi which routes through Discord's native HTTP module first.
        const sendRes = await discordApi("POST", `/channels/${channelId}/messages`, {
            content: blockText,
            nonce: originalMsgId,
            flags: 0,
        });
        const decoyId = sendRes?.id;
        if (!decoyId) {
            logger.error("[Nether] Anti-log nonce: failed to send decoy");
            return;
        }

        // Step 2: Delete the original (this is what fired MESSAGE_DELETE originally,
        // but the dispatch we patched already propagated to local stores).
        // The local overlap means the logger saw the block text replace the original.
        // Now we delete the decoy to clean up the visible chat.
        try {
            await discordApi("DELETE", `/channels/${channelId}/messages/${decoyId}`);
        } catch (e: any) {
            logger.error("[Nether] Anti-log nonce: failed to delete decoy:", e.message);
        }

        // Step 3: Small delay to ensure both deletes propagate cleanly
        await sleep(delay);

        showToast(`🕶️ Anti-log nonce overlap applied to message`);
    } catch (e: any) {
        logger.error("[Nether] Anti-log nonce: send failed:", e.message);
    }
}