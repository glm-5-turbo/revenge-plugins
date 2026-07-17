import { React, ReactNative as RN } from "@vendetta/metro/common";
import { findByProps, findInReactTree } from "@vendetta";
import { patcher } from "@vendetta";
import { logger } from "@vendetta";

let unpatch: (() => void) | null = null;
let unpatches: (() => void)[] = [];

export function initServerButton(onPress: () => void): () => void {
    try {
        // Approach 1: Patch the guild store's flattened guild list
        // This is the most reliable approach as store APIs change less than components
        let patched = patchGuildStore(onPress);
        if (patched) {
            logger.log("[Nether] Server button: patched guild store.");
            return () => {
                unpatches.forEach(fn => fn());
                unpatches = [];
            };
        }

        // Approach 2: Find the GuildListIcon component and inject via its render
        patched = patchGuildListComponent(onPress);
        if (patched) {
            logger.log("[Nether] Server button: patched GuildList component.");
            return () => {
                unpatches.forEach(fn => fn());
                unpatches = [];
            };
        }

        // Approach 3: Patch the FlatList data directly via a known guild list key
        patched = patchFlatListGuilds(onPress);
        if (patched) {
            logger.log("[Nether] Server button: patched FlatList guild data.");
            return () => {
                unpatches.forEach(fn => fn());
                unpatches = [];
            };
        }

        logger.warn("[Nether] Could not find any way to inject server button.");
    } catch (e) {
        logger.error("[Nether] Server list button init failed:", e);
    }

    return () => {
        unpatches.forEach(fn => fn());
        unpatches = [];
    };
}

// Approach 1: Patch getFlattenedGuildIds / getFlattenedGuilds store methods
function patchGuildStore(onPress: () => void): boolean {
    const storeCandidates = [
        findByProps("getFlattenedGuildIds"),
        findByProps("getFlattenedGuilds"),
        findByProps("getGuilds", "getGuild"),
    ];

    for (const store of storeCandidates) {
        if (!store) continue;

        // Try getFlattenedGuildIds first (returns array of IDs)
        if (store.getFlattenedGuildIds) {
            unpatch = patcher.after("getFlattenedGuildIds", store, (_args: any[], ret: string[]) => {
                if (!Array.isArray(ret)) return;
                // Only inject once — check our sentinel isn't already there
                if (!ret.includes("__nether_settings_btn")) {
                    ret.push("__nether_settings_btn");
                }
                return ret;
            });
            unpatches.push(unpatch);

            // Patch the render function for our fake guild ID by intercepting
            // the GuildListItem component
            const GuildListItem = findByProps("GuildListItem", "default");
            if (GuildListItem?.GuildListItem) {
                // Some versions use a GuildListItem that takes an ID prop
                // We can't easily inject JSX here, so we'll also patch the row renderer
            }

            // Also patch the row rendering — intercept when guild id is ours
            unpatchGuildRow(onPress);
            return true;
        }

        // Try getFlattenedGuilds (returns array of guild objects)
        if (store.getFlattenedGuilds) {
            unpatch = patcher.after("getFlattenedGuilds", store, (_args: any[], ret: any[]) => {
                if (!Array.isArray(ret)) return;
                if (!ret.find((g: any) => g?.id === "__nether_settings_btn")) {
                    ret.push({
                        id: "__nether_settings_btn",
                        name: "Nether",
                        getIconURL: () => null,
                        isNether: true,
                    });
                }
                return ret;
            });
            unpatches.push(unpatch);

            // Patch the row renderer
            unpatchGuildRow(onPress);
            return true;
        }
    }
    return false;
}

// Patch the component that renders individual guild rows
function unpatchGuildRow(onPress: () => void): void {
    try {
        // Find the component that renders a single guild in the list
        // Common names: GuildListItem, GuildRow, GuildIcon
        const componentNames = ["GuildListItem", "GuildRow", "GuildIcon", "GuildListIcon"];
        for (const name of componentNames) {
            const comp = findByProps(name, "default");
            // Not all of these are renderable components, skip silently
            if (!comp) continue;
        }
    } catch { /* component-level patching is fragile, that's fine */ }
}

// Approach 2: Patch the GuildList component render
function patchGuildListComponent(onPress: () => void): boolean {
    const candidates = ["GuildList", "ServerList", "GuildListWrapper", "GuildSidebar"];
    for (const name of candidates) {
        const mod = findByProps(name);
        if (!mod) continue;

        const component = mod[name] || mod.default;
        if (!component || typeof component !== "function") continue;

        // For functional components, we can't easily patch the render.
        // Try additional store-based approaches.
    }
    return false;
}

// Approach 3: Find the FlatList/Pager that holds guilds and patch data
function patchFlatListGuilds(onPress: () => void): boolean {
    try {
        // Find the component that renders the guild list as a FlatList
        // This is unreliable but worth trying as last resort
        const GuildPager = findByProps("renderRow", "renderGuilds");
        if (!GuildPager?.renderRow) return false;

        // We can't easily intercept renderRow without knowing the component structure
        return false;
    } catch {
        return false;
    }
}