import { patcher } from "@vendetta";
import { findByName, findByDisplayName, findByStoreName } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";
import { findInReactTree } from "@vendetta/utils";
import { showToast } from "@vendetta/ui/toasts";
import { logger } from "@vendetta";
import SettingsComponent from "./Settings";

let patches: (() => void)[] = [];
let injected = false;

export function initGuildButton(): () => void {
    // Strategy: ConnectedPrivateChannels -> FastList splice (proven pattern)
    try {
        const PC = findByName("ConnectedPrivateChannels", false) as any;
        if (PC) {
            patches.push(patcher.after("default", PC, (_a: any[], res: any) => {
                if (!res?.type?.prototype) return;
                patches.push(patcher.after("render", res.type.prototype, (_r: any[], list: any) => {
                    if (injected) return;
                    const children = findInReactTree(list, (x: any) =>
                        x?.find && typeof x.find === "function" &&
                        (x.type?.name === "FastList" || x.type?.name === "FlashList")
                    ) as any[];
                    if (!children) return;
                    injected = true;
                    children.splice(1, 0, makeBtn());
                    logger.log("[Nether] GuildButton: injected via ConnectedPrivateChannels");
                }));
            }));
            return cleanup();
        }
    } catch {}

    // Try guild list components with FastList splice
    for (const name of ["GuildList", "GuildsBar", "GuildSidebar", "GuildChannelList", "GuildNavigator", "ServerList"]) {
        try {
            const GL = findByDisplayName(name) as any;
            if (!GL) continue;
            const target = GL.default ?? GL;
            if (typeof target !== "function") continue;
            patches.push(patcher.after("default", target, (_a: any[], res: any) => {
                if (injected) return;
                if (res?.type?.prototype) {
                    patches.push(patcher.after("render", res.type.prototype, (_r: any[], list: any) => {
                        if (injected) return;
                        const children = findInReactTree(list, (x: any) =>
                            x?.find && typeof x.find === "function" &&
                            (x.type?.name === "FastList" || x.type?.name === "FlashList")
                        ) as any[];
                        if (!children) return;
                        injected = true;
                        children.splice(1, 0, makeBtn());
                        logger.log(`[Nether] GuildButton: injected via ${name}`);
                    }));
                }
                if (!injected && res?.props?.children) {
                    injected = true;
                    res.props.children = Array.isArray(res.props.children)
                        ? [makeBtn(), ...res.props.children]
                        : [makeBtn(), res.props.children];
                    logger.log(`[Nether] GuildButton: children fallback ${name}`);
                }
            }));
            return cleanup();
        } catch {}
    }

    logger.log("[Nether] GuildButton: no injection found");
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
        React.createElement(ReactNative.Text, { style: { color: "#fff", fontSize: 18, fontWeight: "700" as any } }, "N")
    );
}

function openSettings(): void {
    try {
        const { findByProps } = require("@vendetta/metro");
        const nav = findByProps("pushLazy") as any;
        if (typeof nav?.pushLazy === "function") {
            nav.pushLazy("BUNNY_CUSTOM_PAGE", { title: "Nether", render: () => React.createElement(SettingsComponent) });
            return;
        }
    } catch {}
    showToast("⚙️ Nether: Settings → Plugins → Nether");
}

function cleanup(): () => void {
    return () => { for (const p of patches) p(); patches = []; injected = false; logger.log("[Nether] GuildButton unloaded"); };
}