import { patcher } from "@vendetta";
import { find, findByName, findByDisplayName, findByProps } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";
import { showToast } from "@vendetta/ui/toasts";
import { logger } from "@vendetta";
import SettingsComponent from "./Settings";

let patches: (() => void)[] = [];
let injected = false;

export function initGuildButton(): () => void {
    // The "Add Server" button is always visible in the guild list.
    // Finding it gives us an injection point. On Discord mobile,
    // it's known as GuildAddButton, CreateGuildButton, etc.
    const btnNames = [
        "GuildCreateButton", "CreateGuildButton", "GuildAddButton",
        "AddGuildButton", "ActionButton", "GuildActionButton",
        "CreateGuild", "GuildCreate", "AddServerButton",
    ];

    // Also look for the "+" button or compass button by name
    for (const name of btnNames) {
        try {
            const mod = findByName(name, false) as any;
            if (mod && typeof mod === "function") {
                patches.push(patcher.after("default", mod, (_a: any[], ret: any) => {
                    if (injected || !ret?.props) return;
                    injected = true;
                    const children = Array.isArray(ret.props.children)
                        ? [ret.props.children, makeBtn()]
                        : [ret.props.children, makeBtn()];
                    ret.props.children = children;
                    logger.log(`[Nether] GuildButton: injected next to ${name}`);
                }));
                return cleanup();
            }
        } catch {}
    }

    // Same but with findByDisplayName
    for (const name of btnNames) {
        try {
            const mod = findByDisplayName(name) as any;
            if (!mod) continue;
            const target = mod.default ?? mod;
            if (typeof target !== "function") continue;
            patches.push(patcher.after("default", target, (_a: any[], ret: any) => {
                if (injected || !ret?.props) return;
                injected = true;
                ret.props.children = Array.isArray(ret.props.children)
                    ? [ret.props.children, makeBtn()]
                    : [ret.props.children, makeBtn()];
                logger.log(`[Nether] GuildButton: injected next to ${name} (dn)`);
            }));
            return cleanup();
        } catch {}
    }

    // Try to find the "guild actions" row component
    try {
        const rowNames = ["GuildActionRow", "GuildActions", "GuildToolbar", "GuildListActionRow"];
        for (const name of rowNames) {
            const mod = find((m: any) => {
                const dn = m?.displayName ?? m?.name ?? "";
                return dn.includes(name);
            }) as any;
            if (mod) {
                const target = mod.default ?? mod;
                if (typeof target !== "function") continue;
                patches.push(patcher.after("default", target, (_a: any[], ret: any) => {
                    if (injected || !ret?.props) return;
                    injected = true;
                    ret.props.children = Array.isArray(ret.props.children)
                        ? [ret.props.children, makeBtn()]
                        : [ret.props.children, makeBtn()];
                    logger.log(`[Nether] GuildButton: injected via ${name}`);
                }));
                return cleanup();
            }
        }
    } catch {}

    logger.log("[Nether] GuildButton: no button found to augment");
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