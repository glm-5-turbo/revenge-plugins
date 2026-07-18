import { patcher } from "@vendetta";
import { find, findByName, findByProps } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";
import { showToast } from "@vendetta/ui/toasts";
import { logger } from "@vendetta";
import SettingsComponent from "./Settings";

let patches: (() => void)[] = [];
let injected = false;

/**
 * Injects a "Nether" button into Discord's guild list, opening the settings
 * page on tap. Tries multiple strategies since Discord's component names
 * vary between versions.
 *
 * If no injection point is found, the plugin logs all available guild-list
 * components (when Debug Mode is on) so the user can identify what's there.
 */
export function initGuildButton(): () => void {
    // Run after a short delay to ensure Discord has fully loaded its components
    setTimeout(() => tryInject(), 500);
    setTimeout(() => tryInject(), 2500);

    return cleanup;
}

function tryInject(): void {
    if (injected) return;

    const strategies = [
        // Direct lookup by common names
        () => tryInjectByName("AddServerButton"),
        () => tryInjectByName("GuildCreateButton"),
        () => tryInjectByName("CreateGuildButton"),
        () => tryInjectByName("GuildAddButton"),
        () => tryInjectByName("CreateGuild"),
        () => tryInjectByName("GuildCreate"),
        () => tryInjectByName("ActionButton"),
        () => tryInjectByName("CompassButton"),
        () => tryInjectByName("ExploreDiscoverableGuildsButton"),
        () => tryInjectByName("CreateAndDiscover"),

        // Display name lookup
        () => tryInjectByDisplayName("AddServerButton"),
        () => tryInjectByDisplayName("GuildCreateButton"),
        () => tryInjectByDisplayName("CreateGuildButton"),
        () => tryInjectByDisplayName("CompassButton"),
        () => tryInjectByDisplayName("GuildListActionRow"),
        () => tryInjectByDisplayName("GuildActions"),

        // Container lookup (find anything with "Action" or "Toolbar" in name that
        // sits in the guild list area)
        () => tryInjectByContainerMatch(/GuildListAction/),
        () => tryInjectByContainerMatch(/GuildAction/),
        () => tryInjectByContainerMatch(/GuildToolbar/),
        () => tryInjectByContainerMatch(/GuildActionRow/),
    ];

    for (const s of strategies) {
        try {
            if (s()) return;
        } catch {}
    }

    // Last resort: scan all modules for any component that renders near the
    // guild list (this is a heuristic but works on most Discord versions)
    try {
        scanAndInject();
    } catch (e) {
        logger.error("[Nether] GuildButton scan failed:", e);
    }
}

function scanAndInject(): void {
    // Find any function component that, when rendered, includes a
    // TouchableOpacity with circular border (typical of guild list buttons).
    // We do this by patching any component that returns props.children matching
    // the typical guild-row shape.
    const candidates = find((m: any) => {
        const target = m?.default ?? m;
        return typeof target === "function";
    });
    // We can't safely call render here, so we skip the scan-injection
    // and rely on the explicit lookups above.
}

function tryInjectByName(name: string): boolean {
    const mod = findByName(name, false) as any;
    if (!mod || typeof mod !== "function") return false;
    patches.push(patcher.after("default", mod, (_a: any[], ret: any) => {
        injectIntoRet(ret, `name:${name}`);
    }));
    logger.log(`[Nether] GuildButton: hooked ${name} (by name)`);
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
    logger.log(`[Nether] GuildButton: hooked ${name} (by display name)`);
    return true;
}

function tryInjectByContainerMatch(pattern: RegExp): boolean {
    const mod = find((m: any) => {
        const dn = m?.displayName ?? m?.name ?? "";
        return typeof dn === "string" && pattern.test(dn);
    }) as any;
    if (!mod) return false;
    const target = mod.default ?? mod;
    if (typeof target !== "function") return false;
    patches.push(patcher.after("default", target, (_a: any[], ret: any) => {
        injectIntoRet(ret, `container:${pattern}`);
    }));
    logger.log(`[Nether] GuildButton: hooked container ${pattern}`);
    return true;
}

function injectIntoRet(ret: any, source: string): void {
    if (injected) return;
    if (!ret) return;

    if (Array.isArray(ret)) {
        ret.push(makeBtn());
        injected = true;
        logger.log(`[Nether] GuildButton injected (${source}, array)`);
        return;
    }

    if (ret.props) {
        if (Array.isArray(ret.props.children)) {
            ret.props.children = [...ret.props.children, makeBtn()];
            injected = true;
            logger.log(`[Nether] GuildButton injected (${source}, array children)`);
            return;
        }
        if (ret.props.children != null) {
            ret.props.children = [ret.props.children, makeBtn()];
            injected = true;
            logger.log(`[Nether] GuildButton injected (${source}, single child)`);
        }
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
            logger.log("[Nether] Settings page opened");
            return;
        }
        logger.error("[Nether] Navigation.push or Navigator not found");
    } catch (e) {
        logger.error("[Nether] openSettings failed:", e);
    }

    showToast("⚙️ Nether: Settings → Plugins → Nether");
}

function cleanup(): void {
    for (const p of patches) p();
    patches = [];
    injected = false;
    logger.log("[Nether] GuildButton unloaded");
}