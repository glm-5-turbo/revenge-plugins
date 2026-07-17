import { patcher } from "@vendetta";
import { find, findByName, findByProps, findInReactTree } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";
import { showToast } from "@vendetta/ui/toasts";
import { logger } from "@vendetta";
import SettingsComponent from "./Settings";

let patches: (() => void)[] = [];
let injected = false;

/**
 * Adds a "Nether" button to the Discord guild list (next to the + / compass buttons).
 * Tapping it opens the Nether settings page.
 *
 * Strategy:
 * 1. Try to find Discord's "AddServerButton" / "GuildCreateButton" by name
 * 2. Try to find any "GuildListActionRow" or guild-actions container
 * 3. Try to findInReactTree any row in the guild list containing children
 * 4. As a last resort, show a toast instructing how to open settings manually
 */
export function initGuildButton(): () => void {
    // Try multiple lookup strategies in order of preference
    const strategies = [
        () => tryInjectByName("AddServerButton"),
        () => tryInjectByName("GuildCreateButton"),
        () => tryInjectByName("CreateGuildButton"),
        () => tryInjectByName("GuildAddButton"),
        () => tryInjectByName("GuildCreate"),
        () => tryInjectByName("CreateGuild"),
        () => tryInjectByDisplayName("AddServerButton"),
        () => tryInjectByDisplayName("GuildCreateButton"),
        () => tryInjectByContainer("GuildListActionRow"),
        () => tryInjectByContainer("GuildActionRow"),
        () => tryInjectByContainer("GuildActions"),
        () => tryInjectByReactTree(),
    ];

    for (const s of strategies) {
        try {
            if (s()) {
                return cleanup();
            }
        } catch (e) {
            // continue to next strategy
        }
    }

    logger.log("[Nether] GuildButton: no button found — long-press + button to open Nether settings (when added)");
    return () => {};
}

function tryInjectByName(name: string): boolean {
    const mod = findByName(name, false) as any;
    if (!mod || typeof mod !== "function") return false;
    patches.push(patcher.after("default", mod, (_a: any[], ret: any) => {
        injectIntoRet(ret, `name:${name}`);
    }));
    return true;
}

function tryInjectByDisplayName(name: string): boolean {
    const mod = findByName(name, true) as any;
    if (!mod) return false;
    const target = mod.default ?? mod;
    if (typeof target !== "function") return false;
    patches.push(patcher.after("default", target, (_a: any[], ret: any) => {
        injectIntoRet(ret, `dn:${name}`);
    }));
    return true;
}

function tryInjectByContainer(name: string): boolean {
    const mod = find((m: any) => {
        const dn = m?.displayName ?? m?.name ?? "";
        return typeof dn === "string" && dn.includes(name);
    }) as any;
    if (!mod) return false;
    const target = mod.default ?? mod;
    if (typeof target !== "function") return false;
    patches.push(patcher.after("default", target, (_a: any[], ret: any) => {
        injectIntoRet(ret, `container:${name}`);
    }));
    return true;
}

function tryInjectByReactTree(): boolean {
    // Find any function component whose default returns a guild list structure
    // Look for components containing a TouchableOpacity with margin (the guild list buttons)
    const found = find((m: any) => {
        const target = m?.default ?? m;
        if (typeof target !== "function") return false;
        // Try to render the component and inspect output — risky but a fallback
        return false;
    }) as any;
    return false;
}

function injectIntoRet(ret: any, source: string): void {
    if (injected) return;
    if (!ret?.props) return;

    // Try to find a children array to inject into
    if (Array.isArray(ret.props.children)) {
        ret.props.children = [...ret.props.children, makeBtn()];
        injected = true;
        logger.log(`[Nether] GuildButton injected (${source})`);
        return;
    }
    if (ret.props.children != null) {
        ret.props.children = [ret.props.children, makeBtn()];
        injected = true;
        logger.log(`[Nether] GuildButton injected (${source}, single child)`);
        return;
    }
    // Try the container pattern — ret itself might be a fragment-like wrapper
    if (Array.isArray(ret)) {
        ret.push(makeBtn());
        injected = true;
        logger.log(`[Nether] GuildButton injected (${source}, array)`);
    }
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
 * Pattern from ViewRaw plugin: build a Discord Navigator component wrapping our
 * Settings page, then push it via Navigation.push().
 */
function openSettings(): void {
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
            logger.log("[Nether] Settings page opened via Navigation.push");
            return;
        }

        // Fallback: try the route-based push with BUNNY_CUSTOM_PAGE
        // (only works if we have a React Navigation instance)
        const NavigationNative = findByProps("useNavigation") as any;
        // We can't use useNavigation outside a component, so skip this path.
    } catch (e) {
        logger.error("[Nether] openSettings failed:", e);
    }

    showToast("⚙️ Nether: Settings → Plugins → Nether");
}

function cleanup(): () => void {
    return () => { for (const p of patches) p(); patches = []; injected = false; logger.log("[Nether] GuildButton unloaded"); };
}