import { React, ReactNative as RN } from "@vendetta/metro/common";
import { findByProps, findInReactTree } from "@vendetta";
import { patcher } from "@vendetta";
import { logger } from "@vendetta";

let unpatch: (() => void) | null = null;

export function initServerButton(onPress: () => void): () => void {
    try {
        // Find the GuildList or server list component
        // Discord names change between versions, try multiple approaches
        let GuildList: any = null;

        // Try common component names
        const candidates = ["GuildList", "ServerList"];
        for (const name of candidates) {
            GuildList = findByProps(name);
            if (GuildList) break;
        }

        // Fallback: find by internal props
        if (!GuildList) {
            try {
                GuildList = findByProps("renderGuilds", "renderPlaceholder");
            } catch {}
        }
        if (!GuildList) {
            try {
                GuildList = findByProps("getRenderGuilds");
            } catch {}
        }

        if (!GuildList?.default?.prototype) {
            logger.log("[Nether] Could not find GuildList component, trying alternative approach");
            // Alternative: find the FlatList that renders servers and patch its data source
            try {
                const GuildStore = findByProps("getGuilds", "getFlattenedGuilds");
                if (GuildStore) {
                    unpatch = patcher.after("getFlattenedGuilds", GuildStore, (args: any[], ret: any[]) => {
                        if (!ret) return ret;
                        // Add a fake "server" entry at the end
                        ret.push({
                            id: "nether-settings-btn",
                            name: "Nether",
                            icon: null,
                            isNether: true,
                        });
                        return ret;
                    });
                    logger.log("[Nether] Injected into guild store.");
                    return () => { if (unpatch) unpatch(); };
                }
            } catch (e) {
                logger.error("[Nether] Alt approach failed:", e);
            }
            return () => {};
        }

        // Patch the GuildList render to append our button
        const origRender = GuildList.default.prototype.render;
        unpatch = patcher.after("render", GuildList.default.prototype, (_this: any, args: any[]) => {
            try {
                const result = args[0];
                if (!result) return;

                // Find the FlatList or scrollable that holds server icons
                const flatList = findInReactTree(result, (c: any) =>
                    c?.props?.data?.length > 0 && c?.props?.renderItem
                );

                if (flatList) {
                    const origData = flatList.props.data;
                    flatList.props.data = [
                        ...origData,
                        { id: "nether-settings-btn", isNether: true },
                    ];
                    const origRenderItem = flatList.props.renderItem;
                    flatList.props.renderItem = (info: any) => {
                        const item = info.item;
                        if (item.isNether) {
                            return (
                                <RN.Pressable
                                    onPress={onPress}
                                    style={{
                                        width: 48,
                                        height: 48,
                                        borderRadius: 16,
                                        backgroundColor: "#5865F2",
                                        justifyContent: "center",
                                        alignItems: "center",
                                        marginVertical: 4,
                                    }}
                                >
                                    <RN.Text style={{
                                        color: "#fff",
                                        fontSize: 16,
                                        fontWeight: "bold",
                                    }}>N</RN.Text>
                                </RN.Pressable>
                            );
                        }
                        return origRenderItem(info);
                    };
                }
            } catch (e) {
                // Silent — don't crash the app
            }
        });

        logger.log("[Nether] Server list button injected.");
    } catch (e) {
        logger.error("[Nether] Server list button init failed:", e);
    }

    return () => {
        if (unpatch) {
            unpatch();
            unpatch = null;
        }
        logger.log("[Nether] Server list button removed.");
    };
}
