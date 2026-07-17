import { registerCommand } from "@vendetta/commands";
import { findByProps, findByName } from "@vendetta/metro";
import { React } from "@vendetta/metro/common";
import { showToast } from "@vendetta/ui/toasts";
import { logger } from "@vendetta";
import SettingsComponent from "./Settings";

let unregCommand: (() => void) | null = null;

/**
 * /nether — surefire way to open plugin settings via slash command.
 *
 * Also supports /nether <subcommand>:
 *   /nether settings   — open settings page
 *   /nether info       — show plugin info
 *   /nether help       — show usage
 *
 * Slash commands are a guaranteed-working surface in Vendetta/Revenge (we
 * already use this for /purge) so it provides a stable entry point that
 * doesn't depend on knowing Discord's internal component names.
 */
export function initNetherCommand(): () => void {
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
                description: "What to do: settings, info, or help",
                displayDescription: "What to do: settings, info, or help",
                type: 3 as any, // STRING
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
                    showToast("Nether — all-in-one Revenge toolkit\nAnti-log, purge, AFK, auto-react, ghost pings");
                    return { content: "ℹ️ Nether plugin — open Discord → Revenge → Settings → Plugins → Nether, or run /nether settings" };

                case "help":
                    showToast("/nether settings — open settings\n/nether info — plugin info\n/nether help — this message");
                    return { content: "📖 /nether [settings|info|help]" };

                case "settings":
                default:
                    openSettingsPage();
                    return { content: "⚙️ Opening Nether settings…" };
            }
        },
    });

    logger.log("[Nether] /nether command initialized.");
    return () => {
        if (unregCommand) unregCommand();
        unregCommand = null;
        logger.log("[Nether] /nether command unloaded.");
    };
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