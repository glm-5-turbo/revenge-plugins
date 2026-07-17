import { React, ReactNative as RN } from "@vendetta/metro/common";
import { findByProps } from "@vendetta";
import { patcher } from "@vendetta";
import { logger } from "@vendetta";

let unpatches: (() => void)[] = [];

// Sentinel ID we use to identify our injected entry
const SENTINEL_ID = "__nether_settings_btn";
const SENTINEL_NAME = "Nether";

// Try to find common guild list components & stores
function findGuildStore(): any {
    return (
        findByProps("getFlattenedGuildIds") ??
        findByProps("getFlattenedGuilds") ??
        findByProps("getGuilds", "getGuild")
    );
}

function findGuildListComponent(): any {
    // Common names across Discord versions — any could be the right one
    const names = ["GuildList", "ServerList", "GuildListWrapper", "GuildSidebar", "GuildIcon"];
    for (const name of names) {
        const mod = findByProps(name);
        if (!mod) continue;
        const component = mod[name] || mod.default;
        if (component && typeof component === "function") return { mod, name, component };
    }
    return null;
}

export function initServerButton(onPress: () => void): () => void {
    try {
        // Strategy: Patch the FlatList data and the row renderer
        // This is the approach that works across most Discord/Revenge versions

        // Step 1: Find the component that renders the guild list items
        // In Discord, this is typically a FlatList rendered by GuildList,
        // which uses a renderRow function or GuildListItem component.
        // We need to find either:
        //   a) The FlatList data source (guild store)
        //   b) The row rendering component (to render our button)

        let patched = patchGuildStore();
        if (patched) {
            logger.log("[Nether] Server button: patched guild store.");
        }

        patchGuildRowRenderer(onPress);

        // Register the button — if nothing else, it logs that we tried
        logger.log("[Nether] Server button initialized.");
    } catch (e) {
        logger.error("[Nether] Server list button init failed:", e);
    }

    return () => {
        unpatches.forEach((fn) => fn());
        unpatches = [];
    };
}

// Patch getFlattenedGuildIds to inject our sentinel ID
function patchGuildStore(): boolean {
    const store = findGuildStore();
    if (!store) {
        logger.warn("[Nether] Server btn: no guild store found");
        return false;
    }

    if (store.getFlattenedGuildIds) {
        const un = patcher.after("getFlattenedGuildIds", store, (_args: any[], ret: string[]) => {
            if (!Array.isArray(ret)) return;
            if (!ret.includes(SENTINEL_ID)) {
                ret.push(SENTINEL_ID);
            }
            return ret;
        });
        unpatches.push(un);
        logger.log("[Nether] Server btn: patched getFlattenedGuildIds");
    }

    if (store.getFlattenedGuilds) {
        const un = patcher.after("getFlattenedGuilds", store, (_args: any[], ret: any[]) => {
            if (!Array.isArray(ret)) return;
            if (!ret.find((g: any) => g?.id === SENTINEL_ID)) {
                ret.push({
                    id: SENTINEL_ID,
                    name: SENTINEL_NAME,
                    getIconURL: () => null,
                    isNether: true,
                });
            }
            return ret;
        });
        unpatches.push(un);
        logger.log("[Nether] Server btn: patched getFlattenedGuilds");
    }

    return true;
}

// Find and patch the component that renders individual guild list rows
function patchGuildRowRenderer(onPress: () => void): void {
    try {
        // Look for the guild row rendering — we need to intercept
        // the render and when our sentinel ID shows up, render a settings button

        const guildList = findGuildListComponent();
        if (!guildList) {
            // Fallback: try patching FlatList renderItem
            const FlatList = findByProps("FlatList")?.FlatList;
            const { GuildListItem } = findByProps("GuildListItem", "default") || {};
            if (!FlatList && !GuildListItem) {
                logger.warn("[Nether] Server btn: no renderable component found to patch");
                return;
            }
        }

        // The most common approach: find GuildListItem and patch its default/type
        // to intercept when our sentinel guild is being rendered
        const guildItemNames = ["GuildListItem", "GuildIcon", "GuildRow", "GuildListIcon"];
        for (const name of guildItemNames) {
            const mod = findByProps(name);
            if (!mod) continue;

            const Component = mod[name] || mod.default || mod;
            if (typeof Component === "object" && Component.render) {
                // Class component — patch render
                const un = patcher.after("render", Component, (_args: any[], ret: any, ctx: any) => {
                    const props = ctx?.props || {};
                    if (props?.guildId === SENTINEL_ID || props?.id === SENTINEL_ID) {
                        return createSettingsButton(onPress);
                    }
                    return ret;
                });
                unpatches.push(un);
                logger.log(`[Nether] Server btn: patched ${name}.render`);
                return;
            }

            // Try as a functional component via _render
            if (Component?.type && Component.type.render) {
                const un = patcher.after("render", Component.type, (_args: any[], ret: any, ctx: any) => {
                    const props = ctx?.props || {};
                    if (props?.guildId === SENTINEL_ID || props?.id === SENTINEL_ID) {
                        return createSettingsButton(onPress);
                    }
                    return ret;
                });
                unpatches.push(un);
                logger.log(`[Nether] Server btn: patched ${name}.type.render`);
                return;
            }
        }

        // Last resort: try to find the GuildList component and patch its render
        // to wrap the FlatList with our button injection
        logger.log("[Nether] Server btn: no component-level patch available, relying on store patch only");
    } catch (e) {
        logger.warn("[Nether] Server btn: row renderer patch attempt failed:", e);
    }
}

// Create a simple settings button component
function createSettingsButton(onPress: () => void): React.ReactNode {
    const { View, TouchableOpacity, Text, Image } = RN;

    return (
        <TouchableOpacity
            onPress={onPress}
            style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: "#5865F2",
                justifyContent: "center",
                alignItems: "center",
                marginVertical: 4,
                alignSelf: "center",
            }}
            accessibilityLabel="Nether Settings"
            accessibilityRole="button"
        >
            <Text style={{ color: "#FFF", fontSize: 10, fontWeight: "bold", textAlign: "center" }}>
                N
            </Text>
        </TouchableOpacity>
    );
}