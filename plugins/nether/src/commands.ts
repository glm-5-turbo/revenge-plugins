import { registerCommand } from "@vendetta/commands";
import { findByProps, findByName } from "@vendetta/metro";
import { React } from "@vendetta/metro/common";
import { showToast } from "@vendetta/ui/toasts";
import { logger } from "@vendetta";
import SettingsComponent from "./Settings";
import { storage } from "./storage";

let unregCommand: (() => void) | null = null;
let unregToggleCommand: (() => void) | null = null;

const TOGGLES: { key: keyof typeof storage; label: string }[] = [
    { key: "antiTyping", label: "Anti-Typing" },
    { key: "antiRead", label: "Anti-Read Receipts" },
    { key: "antiPurgeLog", label: "Anti-Purge Log" },
    { key: "messageLogger", label: "Message Logger" },
    { key: "antiLogKeepDeleted", label: "Anti-Log Keep Deleted" },
    { key: "autoDeleteEnabled", label: "Auto-Delete" },
    { key: "afkEnabled", label: "AFK Mode" },
    { key: "autoReactEnabled", label: "Auto-React" },
    { key: "ghostPings", label: "Ghost Pings" },
    { key: "spamGuardEnabled", label: "Spam Guard" },
    { key: "filtersEnabled", label: "Bot Filter" },
    { key: "debugMode", label: "Debug Mode" },
];

/**
 * /nether — open settings, info, help
 * /nether-toggle <setting> [on|off] — quickly toggle any setting
 *
 * The second command is the killer feature: you can flip settings on/off
 * from anywhere with a single slash command, no menus to navigate.
 */
export function initNetherCommand(): () => void {
    // Main /nether command — opens settings page
    unregCommand = registerCommand({
        name: "nether",
        displayName: "Nether",
        description: "Open Nether plugin settings",
        displayDescription: "Open Nether plugin settings",
        applicationId: "-1",
        type: 1 as any,
        inputType: 1 as any,
        options: [
            {
                name: "action",
                displayName: "Action",
                description: "What to do",
                displayDescription: "What to do",
                type: 3 as any,
                required: false,
                choices: [
                    { name: "settings", displayName: "Open Settings", value: "settings" },
                    { name: "info", displayName: "Plugin Info", value: "info" },
                    { name: "help", displayName: "Help", value: "help" },
                ],
            },
        ],
        execute: async (args: any[], _ctx: any) => {
            let action = "settings";
            for (const arg of args || []) {
                if (arg?.name === "action" && arg.value) action = arg.value;
            }

            switch (action) {
                case "info":
                    showToast("Nether — all-in-one Revenge toolkit: anti-log, purge, AFK, auto-react, ghost pings");
                    return { content: "ℹ️ Nether plugin — quick toggles: `/nether-toggle <setting> [on|off]`" };

                case "help":
                    showToast("Quick toggles: /nether-toggle <setting> [on|off]\nSettings: /nether settings");
                    return { content: "📖 Use `/nether-toggle <setting> [on|off]` for quick toggles. Type `/nether-toggle list` to see options." };

                case "settings":
                default:
                    openSettingsPage();
                    return { content: "⚙️ Opening Nether settings…" };
            }
        },
    });

    // /nether-toggle — quick toggle any setting on/off
    unregToggleCommand = registerCommand({
        name: "nether-toggle",
        displayName: "Nether Toggle",
        description: "Quickly toggle a Nether setting on or off",
        displayDescription: "Quickly toggle a Nether setting on or off",
        applicationId: "-1",
        type: 1 as any,
        inputType: 1 as any,
        options: [
            {
                name: "setting",
                displayName: "Setting",
                description: "Which setting to toggle",
                displayDescription: "Which setting to toggle",
                type: 3 as any,
                required: true,
                choices: TOGGLES.map((t) => ({
                    name: camelToKebab(t.key as string),
                    displayName: `${t.label} (${(storage as any)[t.key] ? "ON" : "OFF"})`,
                    value: camelToKebab(t.key as string),
                })).concat([{ name: "list", displayName: "List all settings", value: "list" }]),
            },
            {
                name: "state",
                displayName: "State",
                description: "On or off (omit to toggle current state)",
                displayDescription: "On or off (omit to toggle current state)",
                type: 3 as any,
                required: false,
                choices: [
                    { name: "on", displayName: "On", value: "on" },
                    { name: "off", displayName: "Off", value: "off" },
                    { name: "toggle", displayName: "Toggle", value: "toggle" },
                ],
            },
        ],
        execute: async (args: any[], _ctx: any) => {
            let settingKey = "";
            let state = "toggle";
            for (const arg of args || []) {
                if (arg?.name === "setting") settingKey = arg.value || "";
                if (arg?.name === "state") state = arg.value || "toggle";
            }

            if (settingKey === "list") {
                const lines = TOGGLES.map((t) => {
                    const on = !!(storage as any)[t.key];
                    return `${on ? "🟢" : "⚫"} ${t.label} — /nether-toggle ${camelToKebab(t.key as string)}`;
                });
                showToast(lines.join("\n"));
                return { content: lines.join("\n") };
            }

            const kebabToCamel = (s: string) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
            const actualKey = kebabToCamel(settingKey);
            const toggle = TOGGLES.find((t) => t.key === actualKey);

            if (!toggle) {
                showToast(`Unknown setting: ${settingKey}\nType /nether-toggle list to see options`);
                return { content: `❌ Unknown setting: ${settingKey}` };
            }

            let newValue: boolean;
            if (state === "on") newValue = true;
            else if (state === "off") newValue = false;
            else newValue = !(storage as any)[actualKey];

            (storage as any)[actualKey] = newValue;
            showToast(`${toggle.label}: ${newValue ? "✅ ON" : "❌ OFF"}`);
            return { content: `${toggle.label}: ${newValue ? "✅ ON" : "❌ OFF"}` };
        },
    });

    logger.log("[Nether] /nether commands initialized.");
    return () => {
        if (unregCommand) unregCommand();
        if (unregToggleCommand) unregToggleCommand();
        unregCommand = unregToggleCommand = null;
        logger.log("[Nether] /nether commands unloaded.");
    };
}

function camelToKebab(s: string): string {
    return s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * Open the settings page via Discord's navigation stack.
 * Uses the same pattern as ViewRaw (Navigator + Navigation.push).
 */
function openSettingsPage(): void {
    try {
        const Navigation = findByProps("push", "pop", "replace", "pushLazy") as any;
        const Navigator = (findByName("Navigator") ?? findByProps("Navigator")?.Navigator) as any;
        const headerModule = findByProps("getRenderCloseButton") ?? findByProps("getHeaderCloseButton") as any;
        const renderCloseButton = headerModule?.getRenderCloseButton ?? headerModule?.getHeaderCloseButton;

        if (typeof Navigation?.push === "function" && Navigator) {
            const NetherNavigator = () =>
                React.createElement(Navigator, {
                    initialRouteName: "NetherSettings",
                    goBackOnBackPress: true,
                    screens: {
                        NetherSettings: {
                            title: "Nether",
                            headerLeft: renderCloseButton?.(() => Navigation.pop()),
                            render: SettingsComponent,
                        },
                    },
                });
            Navigation.push(NetherNavigator);
            logger.log("[Nether] Settings page opened via /nether");
            return;
        }
        logger.error("[Nether] Navigation.push or Navigator not found for /nether");
    } catch (e) {
        logger.error("[Nether] openSettingsPage failed:", e);
    }
    showToast("⚙️ Nether: open Revenge → Settings → Plugins → Nether");
}