import { useState } from "react";
import { Forms, General } from "@vendetta/ui/components";
import { useProxy } from "@vendetta/storage";
import { getStorage } from "./storage";
import { showInputAlert } from "@vendetta/ui/alerts";

const { FormSection, FormRow, FormSwitch, FormInput, FormDivider, FormText } = Forms;
const { ScrollView, TouchableOpacity, Text, View, StyleSheet } = General;

type Tab = "antillog" | "purge" | "automation" | "tweaks";

function SettingsTab({ tab }: { tab: Tab }) {
    const s = useProxy(getStorage());

    switch (tab) {
        case "antillog":
            return (
                <View>
                    <FormSection title="Anti-Logging">
                        <FormSwitch
                            label="Anti-Typing"
                            value={s.antiTyping}
                            onValueChange={(v: boolean) => { s.antiTyping = v; }}
                        />
                        <FormDivider />
                        <FormSwitch
                            label="Anti-Read Receipts"
                            value={s.antiRead}
                            onValueChange={(v: boolean) => { s.antiRead = v; }}
                        />
                        <FormDivider />
                        <FormSwitch
                            label="Anti-Purge Log"
                            value={s.antiPurgeLog}
                            onValueChange={(v: boolean) => { s.antiPurgeLog = v; }}
                        />
                        <FormDivider />
                        <FormSwitch
                            label="Message Logger"
                            value={s.messageLogger}
                            onValueChange={(v: boolean) => { s.messageLogger = v; }}
                        />
                    </FormSection>
                    <FormText style={{ padding: 16 }}>
                        Message Logger caches deleted/edited messages so you can still read them.
                    </FormText>
                </View>
            );
        case "purge":
            return (
                <View>
                    <FormSection title="Purge Settings">
                        <FormInput
                            title="Rate Limit Delay (ms)"
                            value={String(s.purgeDelay)}
                            placeholder="500"
                            onChange={(v: string) => { s.purgeDelay = parseInt(v) || 500; }}
                        />
                        <FormDivider />
                        <FormSwitch
                            label="Confirm Before Purge"
                            value={s.purgeConfirm}
                            onValueChange={(v: boolean) => { s.purgeConfirm = v; }}
                        />
                    </FormSection>
                    <FormSection title="Slash Commands">
                        <FormRow label="/nether purge [count]" />
                        <FormDivider />
                        <FormRow label="/nether purge-user @user [count]" />
                    </FormSection>
                </View>
            );
        case "automation":
            return (
                <View>
                    <FormSection title="AFK Mode">
                        <FormSwitch
                            label="Enable AFK"
                            value={s.afkEnabled}
                            onValueChange={(v: boolean) => { s.afkEnabled = v; }}
                        />
                        <FormDivider />
                        <FormInput
                            title="AFK Message"
                            value={s.afkMessage}
                            onChange={(v: string) => { s.afkMessage = v; }}
                        />
                        <FormDivider />
                        <FormInput
                            title="AFK Reply Delay (ms)"
                            value={String(s.afkDelay)}
                            onChange={(v: string) => { s.afkDelay = parseInt(v) || 3000; }}
                        />
                    </FormSection>
                    <FormSection title="Message Scheduler">
                        <FormSwitch
                            label="Enable Scheduler"
                            value={s.schedulerEnabled}
                            onValueChange={(v: boolean) => { s.schedulerEnabled = v; }}
                        />
                    </FormSection>
                    <FormSection title="Auto-React">
                        <FormSwitch
                            label="Enable Auto-React"
                            value={s.autoReactEnabled}
                            onValueChange={(v: boolean) => { s.autoReactEnabled = v; }}
                        />
                        <FormDivider />
                        <TouchableOpacity
                            style={{ padding: 12 }}
                            onPress={() => {
                                showInputAlert({
                                    title: "Add Auto-React Rule",
                                    placeholder: "channelId:emoji or userId:emoji",
                                    onConfirm: (input: string) => {
                                        const [target, emoji] = input.split(":");
                                        if (!target || !emoji) return;
                                        const rule = {
                                            id: Date.now().toString(36),
                                            channelId: target.startsWith("@") ? undefined : target,
                                            userId: target.startsWith("@") ? target : undefined,
                                            emoji,
                                        };
                                        s.autoReactRules = [...s.autoReactRules, rule];
                                    },
                                });
                            }}
                        >
                            <Text style={{ color: "#00AFF4" }}>+ Add Rule</Text>
                        </TouchableOpacity>
                    </FormSection>
                    <FormSection title="Notifications">
                        <FormSwitch
                            label="Notification Bypass (Experimental)"
                            value={s.notifBypassEnabled}
                            onValueChange={(v: boolean) => { s.notifBypassEnabled = v; }}
                        />
                    </FormSection>
                    <FormText style={{ padding: 16 }}>
                        Notification Bypass attempts to surface notifications suppressed when your account appears online on another device.
                    </FormText>
                </View>
            );
        case "tweaks":
            return (
                <View>
                    <FormSection title="Chat Tweaks">
                        <FormSwitch
                            label="Ghost Pings"
                            value={s.ghostPings}
                            onValueChange={(v: boolean) => { s.ghostPings = v; }}
                        />
                        <FormDivider />
                        <FormSwitch
                            label="Spam Guard"
                            value={s.spamGuardEnabled}
                            onValueChange={(v: boolean) => { s.spamGuardEnabled = v; }}
                        />
                        <FormDivider />
                        <FormInput
                            title="Spam Threshold (msgs/10s)"
                            value={String(s.spamGuardThreshold)}
                            onChange={(v: string) => { s.spamGuardThreshold = parseInt(v) || 10; }}
                        />
                        <FormDivider />
                        <FormInput
                            title="Spam Cooldown (ms)"
                            value={String(s.spamGuardCooldown)}
                            onChange={(v: string) => { s.spamGuardCooldown = parseInt(v) || 60000; }}
                        />
                        <FormDivider />
                        <FormSwitch
                            label="Custom Filters"
                            value={s.filtersEnabled}
                            onValueChange={(v: boolean) => { s.filtersEnabled = v; }}
                        />
                        <FormDivider />
                        <TouchableOpacity
                            style={{ padding: 12 }}
                            onPress={() => {
                                showInputAlert({
                                    title: "Add Filter Rule",
                                    placeholder: "user:USERID, regex:PATTERN, or bot",
                                    onConfirm: (input: string) => {
                                        let type: "user" | "regex" | "bot" = "user";
                                        let value = input;
                                        if (input.startsWith("regex:")) { type = "regex"; value = input.slice(6); }
                                        else if (input.startsWith("bot")) { type = "bot"; value = "*"; }
                                        else if (input.startsWith("user:")) { value = input.slice(5); }
                                        const rule = { id: Date.now().toString(36), type, value };
                                        s.filterRules = [...s.filterRules, rule];
                                    },
                                });
                            }}
                        >
                            <Text style={{ color: "#00AFF4" }}>+ Add Filter</Text>
                        </TouchableOpacity>
                    </FormSection>
                </View>
            );
    }
}

const tabs: { key: Tab; label: string }[] = [
    { key: "antillog", label: "Anti-Log" },
    { key: "purge", label: "Purge" },
    { key: "automation", label: "Automation" },
    { key: "tweaks", label: "Tweaks" },
];

export default () => {
    const [activeTab, setActiveTab] = useState<Tab>("antillog");

    return (
        <ScrollView>
            {/* Tab bar */}
            <View style={{ flexDirection: "row", padding: 8, gap: 4 }}>
                {tabs.map((tab) => (
                    <TouchableOpacity
                        key={tab.key}
                        style={{
                            flex: 1,
                            paddingVertical: 8,
                            paddingHorizontal: 4,
                            borderRadius: 8,
                            backgroundColor: activeTab === tab.key ? "#40444B" : "#2F3136",
                        }}
                        onPress={() => setActiveTab(tab.key)}
                    >
                        <Text
                            style={{
                                color: activeTab === tab.key ? "#FFFFFF" : "#72767D",
                                textAlign: "center",
                                fontSize: 13,
                                fontWeight: "600",
                            }}
                        >
                            {tab.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
            <SettingsTab tab={activeTab} />
        </ScrollView>
    );
};
