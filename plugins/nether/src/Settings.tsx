import { useState, useEffect } from "react";
import { React, ReactNative } from "@vendetta/metro/common";
import { Forms } from "@vendetta/ui/components";
import { useProxy } from "@vendetta/storage";
import { storage } from "./storage";

const { FormSection, FormRow, FormSwitch, FormInput, FormDivider } = Forms;
const { ScrollView, TouchableOpacity, Text, View } = ReactNative;

type Tab = "antillog" | "purge" | "automation" | "tweaks";

function S({ label, value, onValueChange }: { label: string; value: boolean; onValueChange: (v: boolean) => void }) {
    return (
        <FormRow
            label={label}
            trailing={<FormSwitch value={value} onValueChange={onValueChange} />}
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
        <ScrollView>
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
                        <S label="Message Logger" value={!!storage.messageLogger} onValueChange={(v) => { storage.messageLogger = v; }} />
                    </FormSection>
                </View>
            )}

            {tab === "purge" && (
                <View>
                    <FormSection title="Purge Settings">
                        <FormInput
                            title="Rate Limit Delay (ms)"
                            value={String(storage.purgeDelay)}
                            onChange={(v: string) => { storage.purgeDelay = parseInt(v) || 800; }}
                        />
                        <FormDivider />
                        <S label="Confirm Before Purge" value={!!storage.purgeConfirm} onValueChange={(v) => { storage.purgeConfirm = v; }} />
                    </FormSection>
                    <FormSection title="Usage">
                        <FormRow label="/purge 5 — deletes your last 5 messages" />
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
                        <FormInput
                            title="Reply Delay (ms)"
                            value={String(storage.afkDelay)}
                            onChange={(v: string) => { storage.afkDelay = parseInt(v) || 3000; }}
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
                        <FormRow label="Leave user/channel filters empty to react everywhere" />
                    </FormSection>
                </View>
            )}

            {tab === "tweaks" && (
                <View>
                    <FormSection title="Chat Tweaks">
                        <S label="Ghost Pings" value={!!storage.ghostPings} onValueChange={(v) => { storage.ghostPings = v; }} />
                        <FormDivider />
                        <S label="Spam Guard" value={!!storage.spamGuardEnabled} onValueChange={(v) => { storage.spamGuardEnabled = v; }} />
                        <FormDivider />
                        <S label="Custom Filters" value={!!storage.filtersEnabled} onValueChange={(v) => { storage.filtersEnabled = v; }} />
                        <FormDivider />
                        <S label="Debug Mode" value={!!storage.debugMode} onValueChange={(v) => { storage.debugMode = v; }} />
                    </FormSection>
                </View>
            )}
        </ScrollView>
    );
}