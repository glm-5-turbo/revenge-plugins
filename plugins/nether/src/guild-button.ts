import { patcher } from "@vendetta";
import { find, findAll, findByDisplayName, findByName, findByProps, findByTypeName } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";
import { showToast } from "@vendetta/ui/toasts";
import { logger } from "@vendetta";
import SettingsComponent from "./Settings";

let patches: (() => void)[] = [];
let injected = false;

/**
 * Try to patch `target` (the component) with our button.
 * Returns true on success.
 */
function tryPatch(target: any, label: string): boolean {
    try {
        if (typeof target !== "function") return false;
        patches.push(patcher.after("default", target, (_args: any[], ret: any) => {
            if (injected || !ret?.props) return;
            injected = true;
            const btn = makeBtn();
            ret.props.children = ret.props.children !== undefined
                ? (Array.isArray(ret.props.children) ? [btn, ...ret.props.children] : [btn, ret.props.children])
                : btn;
        }));
        logger.log(`[Nether] GuildButton: patched via ${label}`);
        return true;
    } catch { return false; }
}

function unwrap(mod: any): any {
    if (typeof mod === "function") return mod;
    return mod?.default ?? mod?.render ?? mod;
}

export function initGuildButton(): () => void {
    // ============================================================
    // STRATEGY 1 – findByDisplayName (common React displayName)
    // Discord mobile uses React displayName on components.
    // These are the most likely names found in the wild.
    // ============================================================
    const displayNames = [
        "GuildList", "GuildsBar", "GuildSidebar", "GuildIcon",
        "HomeButton", "ServerList", "PrivateChannel", "ChannelsList",
        "GuildChannelList", "GuildListHeader", "GuildBar",
        "Guilds", "GuildNavigator", "Sidebar", "NavigationSidebar",
    ];
    for (const name of displayNames) {
        try {
            const mod = findByDisplayName(name) as any;
            if (mod && tryPatch(unwrap(mod), `findByDisplayName("${name}")`)) return cleanup();
        } catch { /* continue */ }
    }

    // ============================================================
    // STRATEGY 2 – findByName (checks function .name property)
    // Some Discord components use function name instead of displayName.
    // ============================================================
    const funcNames = [
        "GuildList", "GuildsBar", "GuildSidebar", "GuildIcon",
        "HomeButton", "ServerList", "GuildNavigator", "Sidebar",
    ];
    for (const name of funcNames) {
        try {
            const mod = findByName(name) as any;
            if (mod && tryPatch(unwrap(mod), `findByName("${name}")`)) return cleanup();
        } catch { /* continue */ }
    }

    // ============================================================
    // STRATEGY 3 – findByTypeName (checks type.name on React.forwardRef etc.)
    // ============================================================
    const typeNames = [
        "GuildList", "GuildsBar", "GuildSidebar", "GuildIcon",
        "HomeButton", "ServerList",
    ];
    for (const name of typeNames) {
        try {
            const mod = findByTypeName(name) as any;
            if (mod && tryPatch(unwrap(mod), `findByTypeName("${name}")`)) return cleanup();
        } catch { /* continue */ }
    }

    // ============================================================
    // STRATEGY 4 – findByProps (module that exports GuildList as key)
    // ============================================================
    try {
        const mod = findByProps("GuildList") as any;
        if (mod?.GuildList && tryPatch(mod.GuildList, 'findByProps("GuildList")')) return cleanup();
    } catch {}

    // ============================================================
    // STRATEGY 5 – find() with loose predicate over ALL modules
    // Searches every metro module for a function whose name/displayName
    // matches common patterns.
    // ============================================================
    const guildKeywords = ["Guild", "Sidebar", "ServerList", "Guilds"];
    try {
        const match = find((m: any) => {
            if (typeof m !== "function" && (typeof m !== "object" || m === null)) return false;
            const dn = m?.displayName ?? m?.name ?? m?.type?.name ?? "";
            return guildKeywords.some(k => dn.includes(k));
        }) as any;
        if (match && tryPatch(unwrap(match), "find()")) return cleanup();
    } catch {}

    // ============================================================
    // STRATEGY 6 – findAll + score by prop overlap
    // Finds ALL modules, picks the one with the most guild-related props.
    // ============================================================
    try {
        const guildProps = ["guilds", "guild", "Guilds"];
        const mods = findAll((m: any) => {
            if (typeof m !== "object" || m === null) return false;
            return guildProps.some(p => p in m);
        }) as any[];
        for (const mod of mods) {
            for (const key of Object.keys(mod)) {
                const val = mod[key];
                if (typeof val === "function") {
                    const dn = val?.displayName ?? val?.name ?? "";
                    if (dn.includes("Guild") || dn.includes("Sidebar")) {
                        if (tryPatch(val, `findAll() -> .${key}`)) return cleanup();
                    }
                }
            }
        }
    } catch {}

    // ============================================================
    // STRATEGY 7 – Catch-all: patch ANY component whose props
    // contain a "guilds" array and "selectedGuildId" — hallmarks
    // of the guild-sidebar component's render-tree.
    // ============================================================
    try {
        const fallback = find((m: any) => {
            if (typeof m !== "function") return false;
            // Check if this renders something with guild-related props
            const proto = m.prototype;
            if (!proto || !proto.render) return false;
            return true;
        }) as any;
        // Last resort
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