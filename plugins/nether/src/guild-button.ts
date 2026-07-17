import { patcher } from "@vendetta";
import { find, findByDisplayName, findByProps } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";
import { showToast } from "@vendetta/ui/toasts";
import { logger } from "@vendetta";
import SettingsComponent from "./Settings";

let patches: (() => void)[] = [];
let injected = false;

export function initGuildButton(): () => void {
    // Strategy 1: Broad search for any matching component
    const names = ["GuildList", "GuildsBar", "GuildIcon", "HomeButton", "GuildSidebar", "ServerList", "PrivateChannel", "ChannelsList"];
    for (const name of names) {
        try {
            const mod = findByDisplayName(name) as any;
            if (!mod) continue;
            const target = typeof mod === "function" ? mod : mod.default ?? mod.render ?? mod;
            if (typeof target !== "function") continue;
            patches.push(patcher.after("default", target, (_args: any[], ret: any) => {
                if (injected || !ret?.props) return;
                injected = true;
                const btn = makeBtn();
                ret.props.children = ret.props.children !== undefined
                    ? (Array.isArray(ret.props.children) ? [btn, ...ret.props.children] : [btn, ret.props.children])
                    : btn;
            }));
            logger.log(`[Nether] GuildButton: patched ${name}`);
            return cleanup();
        } catch {}
    }

    // Strategy 2: find with custom predicate
    try {
        const match = find((m: any) => {
            if (typeof m !== "function" && typeof m !== "object") return false;
            const dn = m?.displayName ?? m?.name ?? "";
            return dn.includes("Guild") || dn.includes("Sidebar") || dn.includes("ServerList");
        }) as any;
        if (match) {
            const target = typeof match === "function" ? match : match.default ?? match;
            patches.push(patcher.after("default", target, (_args: any[], ret: any) => {
                if (injected || !ret?.props) return;
                injected = true;
                const btn = makeBtn();
                ret.props.children = ret.props.children !== undefined
                    ? (Array.isArray(ret.props.children) ? [btn, ...ret.props.children] : [btn, ret.props.children])
                    : btn;
            }));
            logger.log("[Nether] GuildButton: patched via find()");
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

function openSettings(): void {
    try {
        const nav = findByProps("pushLazy") as any;
        if (typeof nav?.pushLazy === "function") {
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