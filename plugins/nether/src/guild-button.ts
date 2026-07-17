import { patcher } from "@vendetta";
import { findByDisplayName, findByProps } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";
import { showToast } from "@vendetta/ui/toasts";
import { logger } from "@vendetta";
import SettingsComponent from "./Settings";

/**
 * Add a Nether settings button to the Discord guild sidebar.
 * Tries multiple strategies to find the right component to patch.
 */

let patches: (() => void)[] = [];
let injected = false;

export function initGuildButton(): () => void {
    // Strategy 1: Patch GuildList component
    try {
        const gl = findDisplayName("GuildList");
        if (gl) {
            patches.push(patcher.after("default", gl, (_args: any[], ret: any) => {
                if (!ret?.props) return;
                const btn = makeBtn();
                ret.props.children = Array.isArray(ret.props.children)
                    ? [btn, ...ret.props.children]
                    : [btn, ret.props.children];
            }));
            logger.log("[Nether] GuildButton: patched GuildList");
            return cleanup();
        }
    } catch {}

    // Strategy 2: Patch GuildsBar
    try {
        const gb = findDisplayName("GuildsBar");
        if (gb) {
            patches.push(patcher.after("default", gb, (_args: any[], ret: any) => {
                if (injected || !ret?.props) return;
                injected = true;
                const btn = makeBtn();
                ret.props.children = Array.isArray(ret.props.children)
                    ? [btn, ...ret.props.children]
                    : [btn, ret.props.children];
            }));
            logger.log("[Nether] GuildButton: patched GuildsBar");
            return cleanup();
        }
    } catch {}

    // Strategy 3: Patch HomeButton
    try {
        const hb = findDisplayName("HomeButton");
        if (hb) {
            patches.push(patcher.after("default", hb, (_args: any[], ret: any) => {
                if (injected || !ret?.props) return;
                injected = true;
                const btn = makeBtn();
                ret.props.children = Array.isArray(ret.props.children)
                    ? [btn, ...ret.props.children]
                    : [btn, ret.props.children];
            }));
            logger.log("[Nether] GuildButton: patched HomeButton");
            return cleanup();
        }
    } catch {}

    // Strategy 4: Patch GuildIcon
    try {
        const gi = findDisplayName("GuildIcon");
        if (gi) {
            patches.push(patcher.after("default", gi, (_args: any[], ret: any) => {
                if (injected || !ret?.props) return;
                injected = true;
                const btn = makeBtn();
                ret.props.children = Array.isArray(ret.props.children)
                    ? [btn, ...ret.props.children]
                    : [btn, ret.props.children];
            }));
            logger.log("[Nether] GuildButton: patched GuildIcon");
            return cleanup();
        }
    } catch {}

    // Strategy 5: Try finding by props
    try {
        const mod = findByProps("GuildList", "guilds") as any;
        if (mod?.GuildList) {
            patches.push(patcher.after("default", mod.GuildList, (_args: any[], ret: any) => {
                if (!ret?.props) return;
                const btn = makeBtn();
                ret.props.children = Array.isArray(ret.props.children)
                    ? [btn, ...ret.props.children]
                    : [btn, ret.props.children];
            }));
            logger.log("[Nether] GuildButton: patched via findByProps");
            return cleanup();
        }
    } catch {}

    logger.log("[Nether] GuildButton: no component found");
    return () => {};
}

function makeBtn(): any {
    return React.createElement(
        ReactNative.TouchableOpacity,
        {
            style: {
                width: 48, height: 48, borderRadius: 24,
                backgroundColor: "#5865F2",
                justifyContent: "center" as any, alignItems: "center" as any,
                marginVertical: 4, marginHorizontal: 8,
            },
            onPress: openSettings,
            onLongPress: () => showToast("Nether Settings"),
        },
        React.createElement(
            ReactNative.Text,
            { style: { color: "#fff", fontSize: 18, fontWeight: "700" as any } },
            "N"
        )
    );
}

function findDisplayName(name: string): any {
    try {
        const m = findByDisplayName(name) as any;
        return m?.default ?? m;
    } catch { return null; }
}

function openSettings(): void {
    try {
        const nav = findByProps("pushLazy") as any;
        if (nav?.pushLazy) {
            nav.pushLazy("BUNNY_CUSTOM_PAGE", {
                title: "Nether",
                render: () => React.createElement(SettingsComponent),
            });
            return;
        }
    } catch {}
    showToast("⚙️ Nether: Settings → Plugins → Nether");
}

function cleanup(): () => void {
    return () => {
        for (const p of patches) p();
        patches = [];
        injected = false;
        logger.log("[Nether] GuildButton unloaded");
    };
}