import { useState } from "react";
import { React, ReactNative } from "@vendetta/metro/common";
import { Forms } from "@vendetta/ui/components";
import { useProxy } from "@vendetta/storage";
import { createStorage, wrapSync, createMMKVBackend } from "@vendetta/storage";
import { showInputAlert } from "@vendetta/ui/alerts";

const { FormSection, FormRow, FormSwitch, FormInput, FormDivider, FormText } = Forms;
const { ScrollView, TouchableOpacity, Text, View } = ReactNative;

type Tab = "antillog" | "purge" | "automation" | "tweaks";

// Direct defaults — will be replaced once storage loads
const defaults = {
    antiTyping: false, antiRead: false, antiPurgeLog: false, messageLogger: false,
    purgeDelay: 500, purgeConfirm: true,
    afkEnabled: false, afkMessage: "I'm currently AFK.", afkDelay: 3000,
    schedulerEnabled: false, autoReactEnabled: false, autoReactRules: [] as any[],
    notifBypassEnabled: false,
    ghostPings: true, spamGuardEnabled: false, spamGuardThreshold: 10,
    spamGuardCooldown: 60000, filtersEnabled: false, filterRules: [] as any[],
};

let settings: any = { ...defaults };

async function loadSettings() {
    try {
        const backend = createMMKVBackend("nether-settings");
        const raw = await createStorage(backend);
        wrapSync(raw);
        const stored = backend.get() as any || {};
        settings = { ...defaults, ...stored };
        return settings;
    } catch (e) {
        console.log("[Nether] Settings load failed, using defaults", e);
        return settings;
    }
}

function saveSettings() {
    try {
        const { createMMKVBackend } = require("@vendetta/storage");
        const backend = createMMKVBackend("nether-settings");
        backend.set(settings);
    } catch (e) {
        console.log("[Nether] Settings save failed", e);
    }
}

function TabContent({ tab }: { tab: Tab }) {
    if (tab === "antillog") return (
        <View>
            <FormSection title="Anti-Logging">
                <FormSwitch
                    label="Anti-Typing"
                    value={!!settings.antiTyping}
                    onValueChange={(v: any) => { settings.antiTyping = v; saveSettings(); }}
                />
                <FormDivider />
                <FormSwitch
                    label="Anti-Read Receipts"
                    value={!!settings.antiRead}
                    onValueChange={(v: any) => { settings.antiRead = v; saveSettings(); }}
                />
                <FormDivider />
                <FormSwitch
                    label="Anti-Purge Log"
                    value={!!settings.antiPurgeLog}
                    onValueChange={(v: any) => { settings.antiPurgeLog = v; saveSettings(); }}
                />
                <FormDivider />
                <FormSwitch
                    label="Message Logger"
                    value={!!settings.messageLogger}
                    onValueChange={(v: any) => { settings.messageLogger = v; saveSettings(); }}
                />
            </FormSection>
        </View>
    );
    if (tab === "purge") return (
        <View>
            <FormSection title="Purge Settings">
                <FormInput
                    title="Rate Limit Delay (ms)"
                    value={String(settings.purgeDelay)}
                    placeholder="500"
                    onChange={(v: string) => { settings.purgeDelay = parseInt(v) || 500; saveSettings(); }}
                />
                <FormDivider />
                <FormSwitch
                    label="Confirm Before Purge"
                    value={!!settings.purgeConfirm}
                    onValueChange={(v: any) => { settings.purgeConfirm = v; saveSettings(); }}
                />
            </FormSection>
            <FormSection title="Slash Commands">
                <FormRow label="/nether purge [count]" />
                <FormDivider />
                <FormRow label="/nether purge-user @user [count]" />
            </FormSection>
        </View>
    );
    if (tab === "automation") return (
        <View>
            <FormSection title="AFK Mode">
                <FormSwitch
                    label="Enable AFK"
                    value={!!settings.afkEnabled}
                    onValueChange={(v: any) => { settings.afkEnabled = v; saveSettings(); }}
                />
                <FormDivider />
                <FormInput
                    title="AFK Message"
                    value={String(settings.afkMessage)}
                    onChange={(v: string) => { settings.afkMessage = v; saveSettings(); }}
                />
                <FormDivider />
                <FormInput
                    title="AFK Reply Delay (ms)"
                    value={String(settings.afkDelay)}
                    onChange={(v: string) => { settings.afkDelay = parseInt(v) || 3000; saveSettings(); }}
                />
            </FormSection>
            <FormSection title="Automation">
                <FormSwitch
                    label="Message Scheduler"
                    value={!!settings.schedulerEnabled}
                    onValueChange={(v: any) => { settings.schedulerEnabled = v; saveSettings(); }}
                />
                <FormDivider />
                <FormSwitch
                    label="Auto-React"
                    value={!!settings.autoReactEnabled}
                    onValueChange={(v: any) => { settings.autoReactEnabled = v; saveSettings(); }}
                />
                <FormDivider />
                <FormSwitch
                    label="Notification Bypass"
                    value={!!settings.notifBypassEnabled}
                    onValueChange={(v: any) => { settings.notifBypassEnabled = v; saveSettings(); }}
                />
            </FormSection>
        </View>
    );
    if (tab === "tweaks") return (
        <View>
            <FormSection title="Chat Tweaks">
                <FormSwitch
                    label="Ghost Pings"
                    value={!!settings.ghostPings}
                    onValueChange={(v: any) => { settings.ghostPings = v; saveSettings(); }}
                />
                <FormDivider />
                <FormSwitch
                    label="Spam Guard"
                    value={!!settings.spamGuardEnabled}
                    onValueChange={(v: any) => { settings.spamGuardEnabled = v; saveSettings(); }}
                />
                <FormDivider />
                <FormSwitch
                    label="Custom Filters"
                    value={!!settings.filtersEnabled}
                    onValueChange={(v: any) => { settings.filtersEnabled = v; saveSettings(); }}
                />
            </FormSection>
        </View>
    );
    return null;
}

const tabs = [
    { key: "antillog" as Tab, label: "Anti-Log" },
    { key: "purge" as Tab, label: "Purge" },
    { key: "automation" as Tab, label: "Auto" },
    { key: "tweaks" as Tab, label: "Tweaks" },
];

export default () => {
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
            <TabContent tab={tab} />
        </ScrollView>
    );
};
