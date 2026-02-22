/**
 * ImageCropper.tsx
 * Full-screen image cropper with 8 independently draggable handles.
 * - 4 corners: drag to resize diagonally
 * - 4 edges: drag to resize one axis only
 * Uses PanResponder (no native modules beyond expo-image-manipulator).
 */

import React, { useRef, useState, useCallback } from "react";
import {
    View,
    Image,
    Modal,
    StyleSheet,
    PanResponder,
    Dimensions,
    TouchableOpacity,
    ActivityIndicator,
    Text,
} from "react-native";
import * as ImageManipulator from "expo-image-manipulator";

const SCREEN = Dimensions.get("window");
const HANDLE = 28;        // touch target size
const HALF = HANDLE / 2;
const MIN_CROP = 80;      // minimum crop dimension in screen pixels
const OVERLAY_COLOR = "rgba(0,0,0,0.65)";
const HANDLE_COLOR = "#fff";
const BORDER_COLOR = "#0a7ea4";

export interface CropResult {
    uri: string;
    width: number;
    height: number;
}

interface Props {
    visible: boolean;
    imageUri: string;
    onCrop: (result: CropResult) => void;
    onCancel: () => void;
}

// Crop rect in screen coordinates
interface Rect { x: number; y: number; w: number; h: number }

export default function ImageCropper({ visible, imageUri, onCrop, onCancel }: Props) {
    // Layout of the displayed image on screen (set once image loads)
    const [layout, setLayout] = useState({ x: 0, y: 0, w: SCREEN.width, h: SCREEN.height, imgW: 1, imgH: 1 });
    const [cropping, setCropping] = useState(false);

    // Crop rect — starts as full image area, updated by handles
    const cropRef = useRef<Rect>({ x: 40, y: 100, w: SCREEN.width - 80, h: SCREEN.height - 200 });
    const [crop, setCrop] = useState<Rect>(cropRef.current);

    const updateCrop = useCallback((next: Rect) => {
        cropRef.current = next;
        setCrop({ ...next });
    }, []);

    // When image loads, initialise crop rect to center 80% of displayed image
    const onImageLayout = useCallback((imgW: number, imgH: number, viewW: number, viewH: number, vx: number, vy: number) => {
        const scale = Math.min(viewW / imgW, viewH / imgH);
        const dw = imgW * scale;
        const dh = imgH * scale;
        const dx = vx + (viewW - dw) / 2;
        const dy = vy + (viewH - dh) / 2;
        setLayout({ x: dx, y: dy, w: dw, h: dh, imgW, imgH });
        // Initial crop rect: 90% of displayed area with 5% inset
        const insetX = dw * 0.05;
        const insetY = dh * 0.05;
        const init = { x: dx + insetX, y: dy + insetY, w: dw - insetX * 2, h: dh - insetY * 2 };
        cropRef.current = init;
        setCrop(init);
    }, []);

    // ── Handle factory ────────────────────────────────────────────
    // axis: 'tl'|'t'|'tr'|'r'|'br'|'b'|'bl'|'l'
    const makeHandle = useCallback((axis: string) => {
        let startCrop: Rect = { ...cropRef.current };
        return PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onPanResponderGrant: () => { startCrop = { ...cropRef.current }; },
            onPanResponderMove: (_e, gs) => {
                const { dx, dy } = gs;
                let { x, y, w, h } = startCrop;

                // LEFT edge moves: tl, l, bl
                if (axis === "tl" || axis === "l" || axis === "bl") {
                    const nx = Math.min(x + dx, x + w - MIN_CROP);
                    const nw = w - (nx - x);
                    x = nx; w = nw;
                }
                // RIGHT edge moves: tr, r, br
                if (axis === "tr" || axis === "r" || axis === "br") {
                    w = Math.max(dx + startCrop.w, MIN_CROP);
                }
                // TOP edge moves: tl, t, tr
                if (axis === "tl" || axis === "t" || axis === "tr") {
                    const ny = Math.min(y + dy, y + h - MIN_CROP);
                    const nh = h - (ny - y);
                    y = ny; h = nh;
                }
                // BOTTOM edge moves: bl, b, br
                if (axis === "bl" || axis === "b" || axis === "br") {
                    h = Math.max(dy + startCrop.h, MIN_CROP);
                }

                // Clamp to image display bounds
                x = Math.max(layout.x, x);
                y = Math.max(layout.y, y);
                w = Math.min(w, layout.x + layout.w - x);
                h = Math.min(h, layout.y + layout.h - y);

                updateCrop({ x, y, w, h });
            },
        });
    }, [layout, updateCrop]);

    // ── Confirm crop ─────────────────────────────────────────────
    const confirmCrop = useCallback(async () => {
        setCropping(true);
        try {
            const { x: sx, y: sy, w: sw, h: sh } = cropRef.current;
            const { x: lx, y: ly, w: lw, h: lh, imgW, imgH } = layout;

            // Map screen coords back to original image pixels
            const scaleX = imgW / lw;
            const scaleY = imgH / lh;
            const originX = Math.round((sx - lx) * scaleX);
            const originY = Math.round((sy - ly) * scaleY);
            const cropW = Math.round(sw * scaleX);
            const cropH = Math.round(sh * scaleY);

            const result = await ImageManipulator.manipulateAsync(
                imageUri,
                [{ crop: { originX, originY, width: cropW, height: cropH } }],
                { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
            );
            onCrop({ uri: result.uri, width: result.width, height: result.height });
        } catch (e) {
            console.error("Crop failed:", e);
        } finally {
            setCropping(false);
        }
    }, [imageUri, layout, onCrop]);

    // ── Handle positions (center of each handle rel. to crop rect) ──
    const cx = crop.x + crop.w / 2;
    const cy = crop.y + crop.h / 2;
    const rx = crop.x + crop.w;
    const by = crop.y + crop.h;

    const handles: { axis: string; px: number; py: number }[] = [
        { axis: "tl", px: crop.x, py: crop.y },
        { axis: "t", px: cx, py: crop.y },
        { axis: "tr", px: rx, py: crop.y },
        { axis: "r", px: rx, py: cy },
        { axis: "br", px: rx, py: by },
        { axis: "b", px: cx, py: by },
        { axis: "bl", px: crop.x, py: by },
        { axis: "l", px: crop.x, py: cy },
    ];

    return (
        <Modal visible={visible} animationType="fade" transparent={false} statusBarTranslucent>
            <View style={styles.root}>
                {/* ── Image ── */}
                <Image
                    source={{ uri: imageUri }}
                    style={styles.fullImg}
                    resizeMode="contain"
                    onLayout={(e) => {
                        const { x, y, width, height } = e.nativeEvent.layout;
                        Image.getSize(imageUri, (iw, ih) => {
                            onImageLayout(iw, ih, width, height, x, y);
                        });
                    }}
                />

                {/* ── Dark overlay (4 rects around crop area) ── */}
                {/* Top */}
                <View style={[styles.overlay, { top: 0, left: 0, right: 0, height: crop.y }]} />
                {/* Bottom */}
                <View style={[styles.overlay, { top: by, left: 0, right: 0, bottom: 0 }]} />
                {/* Left */}
                <View style={[styles.overlay, { top: crop.y, left: 0, width: crop.x - layout.x, height: crop.h }]} />
                {/* Right */}
                <View style={[styles.overlay, { top: crop.y, left: rx, right: 0, height: crop.h }]} />

                {/* ── Crop border ── */}
                <View
                    pointerEvents="none"
                    style={[styles.cropBorder, { left: crop.x, top: crop.y, width: crop.w, height: crop.h }]}
                >
                    {/* Rule-of-thirds grid lines */}
                    <View style={[styles.gridLine, styles.gridH, { top: "33.3%" }]} />
                    <View style={[styles.gridLine, styles.gridH, { top: "66.6%" }]} />
                    <View style={[styles.gridLine, styles.gridV, { left: "33.3%" }]} />
                    <View style={[styles.gridLine, styles.gridV, { left: "66.6%" }]} />
                </View>

                {/* ── Handles ── */}
                {handles.map(({ axis, px, py }) => (
                    <Handle key={axis} px={px} py={py} panHandlers={makeHandle(axis).panHandlers} />
                ))}

                {/* ── Buttons ── */}
                <View style={styles.toolbar}>
                    <TouchableOpacity style={styles.btnCancel} onPress={onCancel}>
                        <Text style={styles.btnText}>✕  Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.btnConfirm} onPress={confirmCrop} disabled={cropping}>
                        {cropping
                            ? <ActivityIndicator color="#fff" />
                            : <Text style={styles.btnConfirmText}>✓  Crop</Text>}
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

// ── Small handle dot ──────────────────────────────────────────────
function Handle({ px, py, panHandlers }: { px: number; py: number; panHandlers: any }) {
    return (
        <View
            {...panHandlers}
            style={[styles.handle, { left: px - HALF, top: py - HALF }]}
        />
    );
}

// ── Styles ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: "#000" },
    fullImg: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
    overlay: { position: "absolute", backgroundColor: OVERLAY_COLOR },
    cropBorder: {
        position: "absolute",
        borderWidth: 1.5,
        borderColor: BORDER_COLOR,
    },
    gridLine: { position: "absolute", backgroundColor: "rgba(255,255,255,0.25)" },
    gridH: { left: 0, right: 0, height: StyleSheet.hairlineWidth },
    gridV: { top: 0, bottom: 0, width: StyleSheet.hairlineWidth },
    handle: {
        position: "absolute",
        width: HANDLE,
        height: HANDLE,
        borderRadius: HALF,
        backgroundColor: HANDLE_COLOR,
        borderWidth: 2,
        borderColor: BORDER_COLOR,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 3,
        elevation: 5,
    },
    toolbar: {
        position: "absolute",
        bottom: 48,
        left: 0,
        right: 0,
        flexDirection: "row",
        justifyContent: "center",
        gap: 20,
    },
    btnCancel: {
        backgroundColor: "rgba(0,0,0,0.6)",
        borderWidth: 1,
        borderColor: "#fff",
        paddingHorizontal: 28,
        paddingVertical: 12,
        borderRadius: 30,
    },
    btnConfirm: {
        backgroundColor: "#0a7ea4",
        paddingHorizontal: 36,
        paddingVertical: 12,
        borderRadius: 30,
    },
    btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
    btnConfirmText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
