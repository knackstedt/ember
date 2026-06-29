import { Game, GamePlatform } from "./types";

export type SplitscreenLayoutType =
  | "2p-horizontal"
  | "2p-vertical"
  | "3p-top-wide"
  | "3p-bottom-wide"
  | "3p-left-wide"
  | "3p-right-wide"
  | "4p-corners"
  | "custom";

export interface SplitscreenSlot {
  index: number;
  displayId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  displayLabel?: string;
}

export interface SplitscreenLayout {
  type: SplitscreenLayoutType;
  slots: SplitscreenSlot[];
  displayIds: string[];
}

export type SplitscreenInstanceType = "native" | "flash" | "libretro" | "video";

export interface SplitscreenInstanceConfig {
  slotIndex: number;
  game: Game;
  instanceType: SplitscreenInstanceType;
  audioSinkId?: string;
  corePath?: string;
}

export type SplitscreenDeviceType = "controller" | "keyboard" | "mouse";

export interface SplitscreenDeviceMapping {
  deviceId: string;
  deviceType: SplitscreenDeviceType;
  slotIndex: number;
  isHost: boolean;
}

export interface SplitscreenAudioMapping {
  sinkId: string;
  sinkLabel: string;
  slotIndex: number;
}

export interface SplitscreenConfig {
  layout: SplitscreenLayout;
  instances: SplitscreenInstanceConfig[];
  deviceMappings: SplitscreenDeviceMapping[];
  audioMappings: SplitscreenAudioMapping[];
  hostDeviceId: string;
  /** Optional mapping of slot index → display ID for per-monitor assignment */
  slotDisplayMapping?: Record<number, string>;
}

export type SplitscreenInstanceStatus =
  | "launching"
  | "running"
  | "stopped"
  | "error";

export interface SplitscreenInstanceState {
  slotIndex: number;
  windowId: number | null;
  pid: number | null;
  browserWindowId: string | null;
  paused: boolean;
  status: SplitscreenInstanceStatus;
  error?: string;
}

export interface SplitscreenSession {
  id: string;
  config: SplitscreenConfig;
  instances: SplitscreenInstanceState[];
  activeOverlaySlot: number | null;
}

export type AudioServerType = "pulseaudio" | "pipewire";

export interface AudioSink {
  id: string;
  name: string;
  label?: string;
  isDefault: boolean;
  server: AudioServerType;
}

export interface DisplayInfo {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isPrimary: boolean;
}

export interface SplitscreenInstanceProgress {
  slotIndex: number;
  step: string;
  detail?: string;
}

export type WindowServerType = "x11" | "wayland";

export interface InputRouter {
  createVirtualDevice(slotIndex: number, deviceType: SplitscreenDeviceType): Promise<string>;
  routeEvent(deviceId: string, event: ArrayBuffer): void;
  destroyVirtualDevice(slotIndex: number): Promise<void>;
  setHostMode(enabled: boolean): void;
  assignDevice(deviceId: string, slotIndex: number): void;
  unassignDevice(deviceId: string): void;
  setHostDevice(deviceId: string): void;
  locateDevice(deviceId: string): Promise<void>;
  cleanup(): Promise<void>;
}

export interface WindowManager {
  positionWindow(windowId: number, slot: SplitscreenSlot): Promise<void>;
  getActiveWindow(): Promise<number | null>;
  focusWindow(windowId: number): Promise<void>;
  getWindowGeometry(windowId: number): Promise<{ x: number; y: number; width: number; height: number } | null>;
  detectDisplayLayout(): Promise<DisplayInfo[]>;
  waitForGameWindow(pid: number, timeoutMs: number): Promise<number | null>;
  cleanup(): Promise<void>;
}

export interface AudioRouter {
  listSinks(): Promise<AudioSink[]>;
  routeStream(pid: number, sinkId: string): Promise<void>;
  unrouteStream(pid: number): Promise<void>;
  setSinkLabel(sinkId: string, label: string): Promise<void>;
  cleanup(): Promise<void>;
}

export const LAYOUT_DEFINITIONS: { type: SplitscreenLayoutType; playerCount: number; label: string }[] = [
  { type: "2p-horizontal", playerCount: 2, label: "2P Horizontal (Side by Side)" },
  { type: "2p-vertical", playerCount: 2, label: "2P Vertical (Stacked)" },
  { type: "3p-top-wide", playerCount: 3, label: "3P Top Wide" },
  { type: "3p-bottom-wide", playerCount: 3, label: "3P Bottom Wide" },
  { type: "3p-left-wide", playerCount: 3, label: "3P Left Wide" },
  { type: "3p-right-wide", playerCount: 3, label: "3P Right Wide" },
  { type: "4p-corners", playerCount: 4, label: "4P Corners (Quadrants)" },
];

export function computeLayoutSlots(
  layoutType: SplitscreenLayoutType,
  displays: DisplayInfo[],
  slotDisplayMapping?: Record<number, string>,
): SplitscreenSlot[] {
  if (displays.length === 0) return [];

  const totalWidth = Math.max(...displays.map((d) => d.x + d.width));
  const totalHeight = Math.max(...displays.map((d) => d.y + d.height));
  const primaryDisplay = displays.find((d) => d.isPrimary) ?? displays[0];

  function slot(index: number, x: number, y: number, w: number, h: number): SplitscreenSlot {
    // If a per-monitor mapping exists, use that display's bounds
    const mappedDisplayId = slotDisplayMapping?.[index];
    const display = mappedDisplayId
      ? displays.find((d) => d.id === mappedDisplayId) ?? primaryDisplay
      : primaryDisplay;

    return {
      index,
      displayId: display.id,
      displayLabel: display.name,
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(w),
      height: Math.round(h),
    };
  }

  // When per-monitor mapping is provided, compute slots within each display's bounds
  if (slotDisplayMapping) {
    const result: SplitscreenSlot[] = [];
    const layoutSlots = computeSpanningSlots(layoutType, totalWidth, totalHeight);
    for (const s of layoutSlots) {
      const displayId = slotDisplayMapping[s.index];
      const display = displays.find((d) => d.id === displayId);
      if (display) {
        // Position the slot within this display's area
        const relW = s.width / totalWidth;
        const relH = s.height / totalHeight;
        const relX = s.x / totalWidth;
        const relY = s.y / totalHeight;
        result.push({
          index: s.index,
          displayId: display.id,
          displayLabel: display.name,
          x: Math.round(display.x + relX * display.width),
          y: Math.round(display.y + relY * display.height),
          width: Math.round(relW * display.width),
          height: Math.round(relH * display.height),
        });
      } else {
        result.push(slot(s.index, s.x, s.y, s.width, s.height));
      }
    }
    return result;
  }

  return computeSpanningSlots(layoutType, totalWidth, totalHeight).map((s) =>
    slot(s.index, s.x, s.y, s.width, s.height),
  );
}

function computeSpanningSlots(
  layoutType: SplitscreenLayoutType,
  totalWidth: number,
  totalHeight: number,
): { index: number; x: number; y: number; width: number; height: number }[] {
  function s(index: number, x: number, y: number, w: number, h: number) {
    return { index, x, y, width: w, height: h };
  }
  switch (layoutType) {
    case "2p-horizontal":
      return [
        s(0, 0, 0, totalWidth / 2, totalHeight),
        s(1, totalWidth / 2, 0, totalWidth / 2, totalHeight),
      ];
    case "2p-vertical":
      return [
        s(0, 0, 0, totalWidth, totalHeight / 2),
        s(1, 0, totalHeight / 2, totalWidth, totalHeight / 2),
      ];
    case "3p-top-wide":
      return [
        s(0, 0, 0, totalWidth, totalHeight / 2),
        s(1, 0, totalHeight / 2, totalWidth / 2, totalHeight / 2),
        s(2, totalWidth / 2, totalHeight / 2, totalWidth / 2, totalHeight / 2),
      ];
    case "3p-bottom-wide":
      return [
        s(0, 0, 0, totalWidth / 2, totalHeight / 2),
        s(1, totalWidth / 2, 0, totalWidth / 2, totalHeight / 2),
        s(2, 0, totalHeight / 2, totalWidth, totalHeight / 2),
      ];
    case "3p-left-wide":
      return [
        s(0, 0, 0, totalWidth / 2, totalHeight),
        s(1, totalWidth / 2, 0, totalWidth / 2, totalHeight / 2),
        s(2, totalWidth / 2, totalHeight / 2, totalWidth / 2, totalHeight / 2),
      ];
    case "3p-right-wide":
      return [
        s(0, 0, 0, totalWidth / 2, totalHeight / 2),
        s(1, 0, totalHeight / 2, totalWidth / 2, totalHeight / 2),
        s(2, totalWidth / 2, 0, totalWidth / 2, totalHeight),
      ];
    case "4p-corners":
      return [
        s(0, 0, 0, totalWidth / 2, totalHeight / 2),
        s(1, totalWidth / 2, 0, totalWidth / 2, totalHeight / 2),
        s(2, 0, totalHeight / 2, totalWidth / 2, totalHeight / 2),
        s(3, totalWidth / 2, totalHeight / 2, totalWidth / 2, totalHeight / 2),
      ];
    default:
      return [];
  }
}

export function detectInstanceType(game: Game): SplitscreenInstanceType {
  const LIBRETRO_PLATFORMS: GamePlatform[] = [
    "nes", "snes", "n64", "gb", "gbc", "gba", "nds",
    "genesis", "sms", "gamegear", "psx", "dreamcast", "pce",
    "atari2600", "atari5200", "atari7800", "lynx", "ngp",
  ];
  if (game.platform === "flash") return "flash";
  if (LIBRETRO_PLATFORMS.includes(game.platform)) return "libretro";
  return "native";
}
