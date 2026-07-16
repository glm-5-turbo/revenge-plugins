import { useState, useRef, useCallback } from "react";
import { React, ReactNative as RN } from "@vendetta/metro/common";
import { findByProps, findInReactTree } from "@vendetta";
import { patcher } from "@vendetta";
import { logger } from "@vendetta";

const { Pressable, Text, View } = RN;
const { GestureResponder } = require("react-native");

let unpatch: (() => void) | null = null;

// Exported for the settings panel to toggle
export let fabEnabled = true;

function DraggableFAB({ onPress }: { onPress: () => void }) {
    const [pos, setPos] = useState({ x: 20, y: 200 });
    const lastOffset = useRef({ x: 20, y: 200 });

    const pan = useRef(
        GestureResponder.create({
            onStartShouldSetPanResponder: () => true,
            onPanResponderGrant: () => { lastOffset.current = { ...pos }; },
            onPanResponderMove: (_: any, gs: any) => {
                setPos({
                    x: Math.max(0, lastOffset.current.x + gs.dx),
                    y: Math.max(0, lastOffset.current.y + gs.dy),
                });
            },
            onPanResponderRelease: () => {},
            onPanResponderTerminate: () => {},
        })
    ).current;

    return (
        <View
            {...pan.panHandlers}
            style={{
                position: "absolute",
                left: pos.x,
                top: pos.y,
                zIndex: 99999,
                elevation: 6,
            }}
        >
            <Pressable
                onPress={onPress}
                style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: "#5865F2",
                    justifyContent: "center",
                    alignItems: "center",
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.3,
                    shadowRadius: 4,
                }}
            >
                <Text style={{ color: "#fff", fontSize: 18, fontWeight: "bold" }}>N</Text>
            </Pressable>
        </View>
    );
}

export function initFAB(onSettingsOpen: () => void): () => void {
    try {
        const { React } = require("@vendetta/metro/common");
        const NavigationNative = require("@vendetta/metro/common").NavigationNative.NavigationContainer;

        unpatch = patcher.after("render", NavigationNative.prototype, (_this: any, args: any[]) => {
            // args[0] is the rendered children
            if (!fabEnabled) return;

            try {
                const children = args[0];
                const SettingsPanel = require("./Settings").default;

                args[0] = () => (
                    <View style={{ flex: 1 }}>
                        {typeof children === "function" ? children() : children}
                        <DraggableFAB onPress={onSettingsOpen} />
                    </View>
                );
            } catch {}
        });

        logger.log("[Nether] FAB injected into app.");
    } catch (e) {
        logger.error("[Nether] FAB injection failed:", e);
    }

    return () => {
        if (unpatch) unpatch();
        unpatch = null;
        logger.log("[Nether] FAB removed.");
    };
}
