import { useState } from "react";
import { React, ReactNative } from "@vendetta/metro/common";
import { Forms } from "@vendetta/ui/components";
import { createMMKVBackend, createStorage, wrapSync } from "@vendetta/storage";

const { FormSection, FormRow, FormSwitch, FormInput, FormDivider } = Forms;
const { ScrollView, TouchableOpacity, Text, View } = ReactNative;

type Tab = "antillog" | "purge" | "automation" | "tweaks";

const defaults = {
    antiTyping: false, antiRead: false, antiPurgeLog: false, messageLogger: false,
    purgeDelay: 500, purgeConfirm: true,
    afkEnabled: false, afkMessage: "I'm currently AFK.", afkDelay: 3000,
    schedulerEnabled: false, autoReactEnabled: false, notifBypassEnabled: false,
    ghostPings: true, spamGuardEnabled: false, spamGuardThreshold: 10,
    spamGuardCooldown: 60000, filtersEnabled: false,
};

let settings: any = { ...defaults };

export function loadSettings() {
    try {
        const backend = createMMKVBackend("nether-settings");
        const raw = backend.get() as any || {};
        settings = { ...defaults, ...raw };
    } catch { /* use defaults */ }
}

function save() {
    try {
        const backend = createMMKVBackend("nether-settings");
        backend.set(settings);
    } catch { /* empty */ }
}

function S({ label, value, onValueChange }: { label: string; value: boolean; onValueChange: (v: boolean) => void }) {
    return (
        <FormRow
            label={label}
            trailing={<FormSwitch value={value} onValueChange={onValueChange} />}
        />
    );
}

function AntiLogTab() {
    return (
        <View>
            <FormSection title="Anti-Logging">
                <S label="Anti-Typing" value={!!settings.antiTyping} onValueChange={(v) => { settings.antiTyping = v; save(); }} />
                <FormDivider />
                <S label="Anti-Read Receipts" value={!!settings.antiRead} onValueChange={(v) => { settings.antiRead = v; save(); }} />
                <FormDivider />
                <S label="Anti-Purge Log" value={!!settings.antiPurgeLog} onValueChange={(v) => { settings.antiPurgeLog = v; save(); }} />
                <FormDivider />
                <S label="Message Logger" value={!!settings.messageLogger} onValueChange={(v) => { settings.messageLogger = v; save(); }} />
            </FormSection>
        </View>
    );
}

function PurgeTab() {
    return (
        <View>
            <FormSection title="Purge Settings">
                <FormInput
                    title="Rate Limit Delay (ms)"
                    value={String(settings.purgeDelay)}
                    onChange={(v: string) => { settings.purgeDelay = parseInt(v) || 500; save(); }}
                />
                <FormDivider />
                <S label="Confirm Before Purge" value={!!settings.purgeConfirm} onValueChange={(v) => { settings.purgeConfirm = v; save(); }} />
            </FormSection>
            <FormSection title="Commands">
                <FormRow label="/nether purge [count]" />
                <FormDivider />
                <FormRow label="/nether purge-user @user [count]" />
            </FormSection>
        </View>
    );
}

function AutomationTab() {
    return (
        <View>
            <FormSection title="AFK Mode">
                <S label="Enable AFK" value={!!settings.afkEnabled} onValueChange={(v) => { settings.afkEnabled = v; save(); }} />
                <FormDivider />
                <FormInput
                    title="AFK Message"
                    value={String(settings.afkMessage)}
                    onChange={(v: string) => { settings.afkMessage = v; save(); }}
                />
                <FormDivider />
                <FormInput
                    title="Reply Delay (ms)"
                    value={String(settings.afkDelay)}
                    onChange={(v: string) => { settings.afkDelay = parseInt(v) || 3000; save(); }}
                />
            </FormSection>
            <FormSection title="Other">
                <S label="Message Scheduler" value={!!settings.schedulerEnabled} onValueChange={(v) => { settings.schedulerEnabled = v; save(); }} />
                <FormDivider />
                <S label="Auto-React" value={!!settings.autoReactEnabled} onValueChange={(v) => { settings.autoReactEnabled = v; save(); }} />
                <FormDivider />
                <S label="Notification Bypass (Experimental)" value={!!settings.notifBypassEnabled} onValueChange={(v) => { settings.notifBypassEnabled = v; save(); }} />
            </FormSection>
        </View>
    );
}

function TweaksTab() {
    return (
        <View>
            <FormSection title="Chat Tweaks">
                <S label="Ghost Pings" value={!!settings.ghostPings} onValueChange={(v) => { settings.ghostPings = v; save(); }} />
                <FormDivider />
                <S label="Spam Guard" value={!!settings.spamGuardEnabled} onValueChange={(v) => { settings.spamGuardEnabled = v; save(); }} />
                <FormDivider />
                <S label="Custom Filters" value={!!settings.filtersEnabled} onValueChange={(v) => { settings.filtersEnabled = v; save(); }} />
            </FormSection>
        </View>
    );
}

const tabs = [
    { key: "antillog" as Tab, label: "Anti-Log" },
    { key: "purge" as Tab, label: "Purge" },
    { key: "automation" as Tab, label: "Auto" },
    { key: "tweaks" as Tab, label: "Tweaks" },
];

export default function SettingsPanel() {
    const [tab, setTab] = useState<Tab>("antillog");

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
            {tab === "antillog" && <AntiLogTab />}
            {tab === "purge" && <PurgeTab />}
            {tab === "automation" && <AutomationTab />}
            {tab === "tweaks" && <TweaksTab />}
        </ScrollView>
    );
}
