import { patcher } from "@vendetta";
import { find, findByName, findByProps } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";
import { showToast } from "@vendetta/ui/toasts";
import { logger } from "@vendetta";
import SettingsComponent from "./Settings";

let patches: (() => void)[] = [];
let injected = false;

export function initGuildButton(): () => void {
    // The "Add Server" button is always visible in the guild list.
    // Finding it gives us an injection point.
    const btnNames = [
        "GuildCreateButton", "CreateGuildButton", "GuildAddButton",
        "AddGuildButton", "ActionButton", "GuildActionButton",
        "CreateGuild", "GuildCreate", "AddServerButton",
    ];

    // Find by function name
    for (const name of btnNames) {
        try {
            const mod = findByName(name, false) as any;
            if (mod && typeof mod === "function") {
                patches.push(patcher.after("default", mod, (_a: any[], ret: any) => {
                    if (injected || !ret?.props) return;
                    injected = true;
                    ret.props.children = Array.isArray(ret.props.children)
                        ? [...ret.props.children, makeBtn()]
                        : [ret.props.children, makeBtn()];
                    logger.log(`[Nether] GuildButton: injected next to ${name}`);
                }));
                return cleanup();
            }
        } catch {}
    }

    // Find by displayName
    for (const name of btnNames) {
        try {
            const mod = findByName(name, true) as any;
            if (!mod) continue;
            const target = mod.default ?? mod;
            if (typeof target !== "function") continue;
            patches.push(patcher.after("default", target, (_a: any[], ret: any) => {
                if (injected || !ret?.props) return;
                injected = true;
                ret.props.children = Array.isArray(ret.props.children)
                    ? [...ret.props.children, makeBtn()]
                    : [ret.props.children, makeBtn()];
                logger.log(`[Nether] GuildButton: injected next to ${name} (dn)`);
            }));
            return cleanup();
        } catch {}
    }

    // Try the guild actions row component
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
                        ? [...ret.props.children, makeBtn()]
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

/**
 * Open Nether settings as a custom page.
 *
 * Uses Discord's global Navigation.push() pattern (from ViewRaw plugin).
 * findByProps("pushLazy") is just used to find the navigation module — its
 * actual method `push` accepts a component reference, not a route name.
 *
 * The pushed component is Discord's Navigator wrapping our Settings page.
 */
function openSettings(): void {
    try {
        const Navigation = findByProps("push", "pop", "replace") as any;
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
            return;
        }
    } catch (e) {
        logger.error("[Nether] openSettings failed:", e);
    }

    // Fallback: just toast a hint
    showToast("⚙️ Nether: Settings → Plugins → Nether");
}

function cleanup(): () => void {
    return () => { for (const p of patches) p(); patches = []; injected = false; logger.log("[Nether] GuildButton unloaded"); };
}