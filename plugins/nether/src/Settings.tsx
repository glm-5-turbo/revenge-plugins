import { useState, useEffect, useRef } from "react";
import { React, ReactNative } from "@vendetta/metro/common";
import { Forms } from "@vendetta/ui/components";
import { useProxy } from "@vendetta/storage";
import { storage } from "./storage";

const { FormSection, FormRow, FormSwitch, FormInput, FormDivider } = Forms;
const { ScrollView, TouchableOpacity, Text, View, KeyboardAvoidingView, Platform } = ReactNative;

type Tab = "antillog" | "purge" | "automation" | "tweaks";

function S({ label, value, onValueChange }: { label: string; value: boolean; onValueChange: (v: boolean) => void }) {
    return (
        <FormRow
            label={label}
            trailing={<FormSwitch value={value} onValueChange={onValueChange} />}
        />
    );
}

/**
 * Number input that allows the field to be empty while editing
 * and only commits a numeric value on blur or when the user is done.
 * This fixes the issue where typing backspace resets to the default.
 */
function NumberInput({
    title,
    value,
    min = 0,
    max,
    onCommit,
}: {
    title: string;
    value: number;
    min?: number;
    max?: number;
    onCommit: (n: number) => void;
}) {
    const [text, setText] = useState(String(value));
    const lastCommitted = useRef(value);

    // Sync from prop only when external value actually changes
    useEffect(() => {
        if (value !== lastCommitted.current) {
            setText(String(value));
            lastCommitted.current = value;
        }
    }, [value]);

    const commit = () => {
        const parsed = text === "" ? NaN : parseInt(text, 10);
        if (isNaN(parsed)) {
            // Revert to last committed value if empty/invalid
            setText(String(lastCommitted.current));
            return;
        }
        let clamped = parsed;
        if (clamped < min) clamped = min;
        if (max != null && clamped > max) clamped = max;
        if (clamped !== lastCommitted.current) {
            lastCommitted.current = clamped;
            onCommit(clamped);
        }
        setText(String(clamped));
    };

    return (
        <FormInput
            title={title}
            value={text}
            keyboardType="numeric"
            onChange={setText}
            onBlur={commit}
            onSubmitEditing={commit}
        />
    );
}

const tabs: { key: Tab; label: string }[] = [
    { key: "antillog", label: "Anti-Log" },
    { key: "purge", label: "Purge" },
    { key: "automation", label: "Auto" },
    { key: "tweaks", label: "Tweaks" },
];

export default function SettingsPanel() {
    const [tab, setTab] = useState<Tab>("antillog");
    useProxy(storage);

    // Wire AFK toggle
    useEffect(() => {
        try {
            const toggle = (globalThis as any).__nether_setAFK;
            if (toggle) toggle(storage.afkEnabled);
        } catch {}
    }, [storage.afkEnabled]);

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
            <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
                <View style={{ flexDirection: "row", padding: 10, gap: 6 }}>
                    {tabs.map((t) => (
                        <TouchableOpacity
                            key={t.key}
                            style={{
                                flex: 1,
                                paddingVertical: 8,
                                borderRadius: 10,
                                backgroundColor: tab === t.key ? "#5865F2" : "#2F3136",
                            }}
                            onPress={() => setTab(t.key)}
                        >
                            <Text style={{
                                color: tab === t.key ? "#fff" : "#b5bac1",
                                textAlign: "center",
                                fontSize: 13,
                                fontWeight: "bold",
                            }}>
                                {t.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {tab === "antillog" && (
                    <View>
                        <FormSection title="Anti-Logging">
                            <S label="Anti-Typing" value={!!storage.antiTyping} onValueChange={(v) => { storage.antiTyping = v; }} />
                            <FormDivider />
                            <S label="Anti-Read Receipts" value={!!storage.antiRead} onValueChange={(v) => { storage.antiRead = v; }} />
                            <FormDivider />
                            <S label="Anti-Purge Log" value={!!storage.antiPurgeLog} onValueChange={(v) => { storage.antiPurgeLog = v; }} />
                            <FormDivider />
                            {storage.antiPurgeLog && <FormInput
                                title="Block Message"
                                value={String(storage.antiPurgeLogMessage)}
                                onChange={(v: string) => { storage.antiPurgeLogMessage = v; }}
                            />}
                            <FormDivider />
                            <S label="Anti-Log Nonce Overlap" value={!!storage.antiLogNonce} onValueChange={(v) => { storage.antiLogNonce = v; }} />
                            {storage.antiLogNonce && <>
                                <FormDivider />
                                <FormInput
                                    title="Block Message"
                                    value={String(storage.antiLogNonceBlock)}
                                    onChange={(v: string) => { storage.antiLogNonceBlock = v; }}
                                />
                                <FormDivider />
                                <NumberInput
                                    title="Delete Delay (ms)"
                                    value={storage.antiLogNonceDelay ?? 120}
                                    min={50}
                                    max={2000}
                                    onCommit={(v) => { storage.antiLogNonceDelay = v; }}
                                />
                            </>}
                            <FormRow label="Sends a decoy w/ same nonce to overlap the original" />
                            <FormDivider />
                            <S label="Message Logger" value={!!storage.messageLogger} onValueChange={(v) => { storage.messageLogger = v; }} />
                            {storage.messageLogger && <>
                                <FormDivider />
                                <S label="Show Edit History Inline" value={!!storage.messageLoggerShowHistory} onValueChange={(v) => { storage.messageLoggerShowHistory = v; }} />
                            </>}
                            <FormDivider />
                            <S label="Keep Deleted Locally (Anti-Log)" value={!!storage.antiLogKeepDeleted} onValueChange={(v) => { storage.antiLogKeepDeleted = v; }} />
                            <FormRow label="Local-only: shows your deletes in YOUR client" />
                        </FormSection>
                    </View>
                )}

                {tab === "purge" && (
                    <View>
                        <FormSection title="Purge Settings">
                            <NumberInput
                                title="Rate Limit Delay (ms)"
                                value={storage.purgeDelay ?? 100}
                                min={0}
                                max={10_000}
                                onCommit={(v) => { storage.purgeDelay = v; }}
                            />
                            <FormDivider />
                            <S label="Confirm Before Purge" value={!!storage.purgeConfirm} onValueChange={(v) => { storage.purgeConfirm = v; }} />
                        </FormSection>
                        <FormSection title="Auto-Delete (Telegram-style)">
                            <S label="Enable Auto-Delete" value={!!storage.autoDeleteEnabled} onValueChange={(v) => { storage.autoDeleteEnabled = v; }} />
                            <FormDivider />
                            <NumberInput
                                title="Delete after (hours)"
                                value={Math.round((storage.autoDeleteDelay ?? 86_400_000) / 3_600_000)}
                                min={1}
                                max={8760}
                                onCommit={(v) => { storage.autoDeleteDelay = v * 3_600_000; }}
                            />
                            <FormRow label="Messages auto-delete after the set time" />
                            <FormRow label="Requires Revenge running in background" />
                        </FormSection>
                        <FormSection title="Usage">
                            <FormRow label="/purge 5 — deletes your last 5 messages" />
                            <FormDivider />
                            <FormRow label="/purge 250 — deletes your last 250" />
                            <FormDivider />
                            <FormRow label="/purge 10 user: @someone — your msgs mentioning them" />
                        </FormSection>
                    </View>
                )}

                {tab === "automation" && (
                    <View>
                        <FormSection title="AFK Mode">
                            <S label="Enable AFK" value={!!storage.afkEnabled} onValueChange={(v) => { storage.afkEnabled = v; }} />
                            <FormDivider />
                            <FormInput
                                title="AFK Message"
                                value={String(storage.afkMessage)}
                                onChange={(v: string) => { storage.afkMessage = v; }}
                            />
                            <FormDivider />
                            <NumberInput
                                title="Reply Delay (ms)"
                                value={storage.afkDelay ?? 3000}
                                min={0}
                                max={60_000}
                                onCommit={(v) => { storage.afkDelay = v; }}
                            />
                        </FormSection>
                        <FormSection title="Auto-React">
                            <S label="Enable Auto-React" value={!!storage.autoReactEnabled} onValueChange={(v) => { storage.autoReactEnabled = v; }} />
                            <FormDivider />
                            <FormInput
                                title="Emoji (Unicode)"
                                value={String(storage.autoReactEmoji)}
                                onChange={(v: string) => { storage.autoReactEmoji = v; }}
                            />
                            <FormRow label="💬 DMs only, within 1 min of your last message" />
                        </FormSection>
                    </View>
                )}

                {tab === "tweaks" && (
                    <View>
                        <FormSection title="Chat Tweaks">
                            <S label="Ghost Pings" value={!!storage.ghostPings} onValueChange={(v) => { storage.ghostPings = v; }} />
                            <FormDivider />
                            <S label="Spam Guard" value={!!storage.spamGuardEnabled} onValueChange={(v) => { storage.spamGuardEnabled = v; }} />
                            {storage.spamGuardEnabled && <>
                                <FormDivider />
                                <NumberInput
                                    title="Spam Threshold (msgs)"
                                    value={storage.spamGuardThreshold ?? 10}
                                    min={2}
                                    max={100}
                                    onCommit={(v) => { storage.spamGuardThreshold = v; }}
                                />
                                <FormDivider />
                                <NumberInput
                                    title="Cooldown (seconds)"
                                    value={(storage.spamGuardCooldown ?? 60000) / 1000}
                                    min={5}
                                    max={600}
                                    onCommit={(v) => { storage.spamGuardCooldown = v * 1000; }}
                                />
                                <FormRow label={`Hides messages for ${((storage.spamGuardCooldown ?? 60000) / 1000).toFixed(0)}s after ${storage.spamGuardThreshold ?? 10} msgs in 10s`} />
                            </>}
                            <FormDivider />
                            <S label="Custom Filters" value={!!storage.filtersEnabled} onValueChange={(v) => { storage.filtersEnabled = v; }} />
                            <FormDivider />
                            <S label="Debug Mode" value={!!storage.debugMode} onValueChange={(v) => { storage.debugMode = v; }} />
                        </FormSection>
                    </View>
                )}
            </ScrollView>
        </KeyboardAvoidingView>
    );
}