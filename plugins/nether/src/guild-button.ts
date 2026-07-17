import { patcher } from "@vendetta";
import { findByDisplayName, findByProps } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";
import { showToast } from "@vendetta/ui/toasts";
import { logger } from "@vendetta";
import SettingsComponent from "./Settings";

/**
 * Add a settings button to the Discord guild sidebar.
 *
 * Finds the GuildList component and injects a custom button
 * at the top that opens the Nether plugin settings.
 */

let patches: (() => void)[] = [];

export function initGuildButton(): () => void {
    try {
        const GuildList = findGuildList();
        if (!GuildList) {
            logger.log("[Nether] GuildList not found, skipping guild button");
            return () => {};
        }

        const navigation = findByProps("pushLazy", "push") as any;

        const unpatch = patcher.after("default", GuildList, (_args: any[], ret: any) => {
            if (!ret?.props?.children) return;

            const button = React.createElement(
                ReactNative.TouchableOpacity,
                {
                    style: {
                        width: 48,
                        height: 48,
                        borderRadius: 24,
                        backgroundColor: "#5865F2",
                        justifyContent: "center",
                        alignItems: "center",
                        marginVertical: 4,
                        marginHorizontal: 8,
                        elevation: 2,
                        shadowColor: "#5865F2",
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.3,
                        shadowRadius: 3,
                    },
                    onPress: () => openSettings(navigation),
                    onLongPress: () => showToast("Nether Settings"),
                },
                React.createElement(
                    ReactNative.Text,
                    { style: { color: "#fff", fontSize: 18, fontWeight: "700" } },
                    "N"
                )
            );

            // Inject at the beginning of guild list
            const children = Array.isArray(ret.props.children)
                ? [button, ...ret.props.children]
                : [button, ret.props.children];

            ret.props.children = children;
        });

        patches.push(unpatch);
        logger.log("[Nether] Guild button initialized.");
    } catch (e) {
        logger.error("[Nether] Guild button init failed:", e);
    }

    return () => {
        for (const p of patches) p();
        patches = [];
        logger.log("[Nether] Guild button unloaded.");
    };
}

function findGuildList(): any {
    // Try common display names for the guild list
    for (const name of ["GuildList", "GuildSidebar", "ServerList", "GuildListPage"]) {
        try {
            const mod = findByDisplayName(name) as any;
            if (mod?.default || mod?.render) return mod.default ?? mod;
        } catch {}
    }
    // Fallback: try finding by props
    try {
        const mod = findByProps("GuildList", "guilds") as any;
        if (mod?.GuildList) return mod.GuildList;
    } catch {}
    return null;
}

function openSettings(nav: any): void {
    try {
        if (nav?.pushLazy) {
            nav.pushLazy("BUNNY_CUSTOM_PAGE", {
                title: "Nether",
                render: () => React.createElement(SettingsComponent),
            });
        } else if (nav?.push) {
            nav.push({
                name: "NETHER_SETTINGS",
                title: "Nether",
                render: () => React.createElement(SettingsComponent),
            });
        } else {
            showToast("⚙️ Nether: Check plugin settings in Revenge → Plugins");
        }
    } catch (e) {
        logger.error("[Nether] Failed to open settings:", e);
        showToast("❌ Failed to open settings");
    }
}