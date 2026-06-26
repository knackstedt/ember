import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gamepad2,
  Lock,
  Unlock,
  ChevronDown,
  ChevronRight,
  Usb,
  Bluetooth,
  Wifi,
  HelpCircle,
  Zap,
  Battery,
  BatteryMedium,
  BatteryLow,
  BatteryWarning,
  BatteryFull,
  BatteryCharging,
  Activity,
  Cpu,
  Clock,
  Pencil,
  RefreshCw,
  Copy,
  Bug,
  Link2,
  Unlink,
  Search,
  Trash2,
} from "lucide-react";
import { useInputStore } from "../../store/input.store";
import type { LiveControllerState } from "../../store/input.store";
import {
  ControllerDevice,
  ControllerType,
  ButtonMapping,
  NormalizedInputEvent,
  BluetoothDevice,
} from "../../../../shared/types";
import { XboxController } from "./XboxController";
import { PS4Controller } from "./PS4Controller";
import { PS2Controller } from "./PS2Controller";
import { GameCubeController } from "./GameCubeController";
import { N64Controller } from "./N64Controller";
import { SwitchController } from "./SwitchController";
import { WiiController } from "./WiiController";
import {
  PSXIcon,
  PSCircleIcon,
  PSSquareIcon,
  PSTriangleIcon,
} from "./PlayStationIcons";
import { subscribeLearning, setLearningDeviceIds } from "../../hooks/useControllerWorker";
import { useContextMenu } from "../../hooks/useContextMenu";
import { ContextMenuOption } from "../../components/ContextMenu/ContextMenu";

const CONTROLLER_ICON_SIZE = 28;

const CONTROLLER_ICONS: Record<ControllerType, React.ReactNode> = {
  xbox: <Gamepad2 size={CONTROLLER_ICON_SIZE} />,
  ps1: <Gamepad2 size={CONTROLLER_ICON_SIZE} />,
  ps2: <Gamepad2 size={CONTROLLER_ICON_SIZE} />,
  ps3: <Gamepad2 size={CONTROLLER_ICON_SIZE} />,
  ps4: <Gamepad2 size={CONTROLLER_ICON_SIZE} />,
  ps5: <Gamepad2 size={CONTROLLER_ICON_SIZE} />,
  gamecube: <Gamepad2 size={CONTROLLER_ICON_SIZE} />,
  n64: <Gamepad2 size={CONTROLLER_ICON_SIZE} />,
  switch: <Gamepad2 size={CONTROLLER_ICON_SIZE} />,
  wiimote: <Gamepad2 size={CONTROLLER_ICON_SIZE} />,
  generic: <Gamepad2 size={CONTROLLER_ICON_SIZE} />,
};

const CONNECTION_ICONS: Record<string, React.ReactNode> = {
  wired: <Usb size={14} />,
  bluetooth: <Bluetooth size={14} />,
  dongle: <Wifi size={14} />,
  wireless: <Wifi size={14} />,
  unknown: <HelpCircle size={14} />,
};

const CONNECTION_LABELS: Record<string, string> = {
  wired: "Wired",
  bluetooth: "Bluetooth",
  dongle: "Wireless Dongle",
  wireless: "Wireless",
  unknown: "Unknown",
};

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function BatteryIcon({ level }: { level?: number }) {
  if (level === undefined) return <Battery size={14} />;
  if (level >= 95) return <BatteryFull size={14} />;
  if (level >= 70) return <BatteryMedium size={14} />;
  if (level >= 40) return <Battery size={14} />;
  if (level >= 20) return <BatteryLow size={14} />;
  if (level > 0) return <BatteryWarning size={14} />;
  return <BatteryCharging size={14} />;
}

function SignalStrengthBar({ pct }: { pct?: number }) {
  if (pct === undefined) return null;
  const color = pct >= 70 ? "#4ade80" : pct >= 40 ? "#facc15" : "#f87171";
  return (
    <div className="flex items-center gap-1.5">
      <Activity size={14} style={{ color }} />
      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-1)" }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-[12px] font-mono" style={{ color: "var(--text-secondary)" }}>
        {pct}%
      </span>
    </div>
  );
}

const DEFAULT_ACTIONS = [
  "confirm",
  "cancel",
  "up",
  "down",
  "left",
  "right",
  "menu",
  "back",
  "page_up",
  "page_down",
  "favorite",
  "search",
  "play_pause",
  "volume_up",
  "volume_down",
  "fullscreen",
];

const GENERIC_BUTTON_LABELS: Record<string, React.ReactNode> = {
  south: <>A / <PSXIcon /></>,
  east: <>B / <PSCircleIcon /></>,
  west: <>X / <PSSquareIcon /></>,
  north: <>Y / <PSTriangleIcon /></>,
  left_bumper: "LB / L1",
  right_bumper: "RB / R1",
  left_trigger: "LT / L2",
  right_trigger: "RT / R2",
  select: "Back / Share",
  start: "Start / Options",
  home: "Guide / PS",
  left_thumb: "LS / L3",
  right_thumb: "RS / R3",
  touchpad: "Touchpad",
  dpad_up: "D-Pad Up",
  dpad_down: "D-Pad Down",
  dpad_left: "D-Pad Left",
  dpad_right: "D-Pad Right",
  c: "C (Nunchuk)",
  z: "Z (Nunchuk)",
};

const TYPE_BUTTON_LABELS: Partial<Record<ControllerType, Record<string, React.ReactNode>>> = {
  switch: {
    south: "B",
    east: "A",
    west: "Y",
    north: "X",
    left_bumper: "L",
    right_bumper: "R",
    left_trigger: "ZL",
    right_trigger: "ZR",
    select: "−",
    start: "+",
    home: "Home",
    left_thumb: "LS / L3",
    right_thumb: "RS / R3",
    dpad_up: "D-Pad Up",
    dpad_down: "D-Pad Down",
    dpad_left: "D-Pad Left",
    dpad_right: "D-Pad Right",
  },
  gamecube: {
    south: "A",
    east: "B",
    north: "X",
    west: "Y",
    left_bumper: "L",
    right_bumper: "R",
    left_trigger: "Z",
    start: "Start",
    left_thumb: "Stick",
    right_thumb: "C-Stick",
    dpad_up: "D-Pad Up",
    dpad_down: "D-Pad Down",
    dpad_left: "D-Pad Left",
    dpad_right: "D-Pad Right",
  },
  n64: {
    south: "A",
    east: "B",
    north: "C↑",
    west: "C←",
    left_bumper: "L",
    right_bumper: "R",
    left_trigger: "Z",
    start: "Start",
    left_thumb: "Stick",
    c_up: "C↑",
    c_down: "C↓",
    c_left: "C←",
    c_right: "C→",
    dpad_up: "D-Pad Up",
    dpad_down: "D-Pad Down",
    dpad_left: "D-Pad Left",
    dpad_right: "D-Pad Right",
  },
  wiimote: {
    south: "A",
    east: "B",
    west: "1",
    north: "2",
    select: "−",
    start: "+",
    home: "Home",
    left_thumb: "Nunchuk Stick",
    c: "C",
    z: "Z",
    dpad_up: "D-Pad Up",
    dpad_down: "D-Pad Down",
    dpad_left: "D-Pad Left",
    dpad_right: "D-Pad Right",
  },
};

function getButtonLabel(type: ControllerType, code: string): React.ReactNode {
  return TYPE_BUTTON_LABELS[type]?.[code] ?? GENERIC_BUTTON_LABELS[code] ?? code;
}

const BUTTON_CODES = Object.keys(GENERIC_BUTTON_LABELS);

const STANDARD_AXIS_NAMES = new Set([
  "left_x",
  "left_y",
  "right_x",
  "right_y",
  "left_trigger",
  "right_trigger",
  "dpad_x",
  "dpad_y",
]);

let devToolsOpen = false;
window.htpc.devtools
  ?.isOpen?.()
  .then((open) => { devToolsOpen = open; })
  .catch(() => { /* ignore */ });
window.htpc.devtools?.onChange?.((open) => { devToolsOpen = open; });

function isKnownButton(name: string): boolean {
  return BUTTON_CODES.includes(name);
}

function isKnownAxis(name: string): boolean {
  return STANDARD_AXIS_NAMES.has(name);
}

interface MappingRowProps {
  inputCode: string;
  currentAction: string;
  controllerType: ControllerType;
  isLearning: boolean;
  learnedRaw: number | null;
  onStartLearn: () => void;
  onCancelLearn: () => void;
  onSave: (action: string) => void;
  onHover: (code: string | null) => void;
}

const MappingRow: React.FC<MappingRowProps> = ({
  inputCode,
  currentAction,
  controllerType,
  isLearning,
  learnedRaw,
  onStartLearn,
  onCancelLearn,
  onSave,
  onHover,
}) => {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState(currentAction);

  useEffect(() => {
    setSelected(currentAction);
  }, [currentAction]);

  return (
    <motion.div
      className="flex items-center justify-between py-2 px-3 rounded gap-2"
      style={{
        background: isLearning
          ? "color-mix(in srgb, var(--accent) 18%, var(--surface-1))"
          : "var(--surface-1)",
        border: `1px solid ${isLearning ? "var(--accent)" : "var(--border-default)"}`,
        outline: isLearning ? "1px solid var(--accent)" : "none",
      }}
      animate={isLearning ? { opacity: [1, 0.6, 1] } : { opacity: 1 }}
      transition={isLearning ? { repeat: Infinity, duration: 0.9 } : {}}
      onMouseEnter={() => onHover(inputCode)}
      onMouseLeave={() => onHover(null)}
    >
      <span
        className="text-sm font-mono w-28 shrink-0"
        style={{ color: "var(--text-primary)" }}
      >
        {getButtonLabel(controllerType, inputCode)}
      </span>

      {isLearning ? (
        <div className="flex flex-1 items-center gap-2 justify-between">
          <span className="text-xs" style={{ color: "var(--accent)" }}>
            {learnedRaw !== null
              ? `Captured raw code ${learnedRaw} — save?`
              : "Press a button on the controller…"}
          </span>
          <div className="flex gap-2">
            {learnedRaw !== null && (
              <motion.button
                className="px-3 py-1 rounded text-xs"
                style={{
                  background: "var(--accent)",
                  color: "var(--surface-base)",
                }}
                onClick={() => {
                  onSave(currentAction || DEFAULT_ACTIONS[0]);
                  onCancelLearn();
                }}
                whileTap={{ scale: 0.96 }}
              >
                Save
              </motion.button>
            )}
            <motion.button
              className="px-2 py-1 rounded text-xs"
              style={{
                background: "var(--surface-0)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border-default)",
              }}
              onClick={onCancelLearn}
              whileTap={{ scale: 0.96 }}
            >
              Cancel
            </motion.button>
          </div>
        </div>
      ) : editing ? (
        <div className="flex flex-1 items-center gap-2 justify-between">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="flex-1 text-sm px-2 py-1 rounded"
            style={{
              background: "var(--surface-0)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
              outline: "none",
            }}
          >
            {DEFAULT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <div className="flex gap-1">
            <motion.button
              className="px-3 py-1 rounded text-xs"
              style={{
                background: "var(--accent)",
                color: "var(--surface-base)",
              }}
              onClick={() => {
                onSave(selected);
                setEditing(false);
              }}
              whileTap={{ scale: 0.96 }}
            >
              Save
            </motion.button>
            <motion.button
              className="px-2 py-1 rounded text-xs"
              style={{
                background: "var(--surface-0)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border-default)",
              }}
              onClick={() => setEditing(false)}
              whileTap={{ scale: 0.96 }}
            >
              ✕
            </motion.button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center gap-2 justify-between">
          <span
            className="text-sm"
            style={{
              color: currentAction
                ? "var(--accent)"
                : "var(--text-secondary)",
            }}
          >
            {currentAction || "—"}
          </span>
          <div className="flex gap-1">
            <motion.button
              className="px-2 py-0.5 rounded text-xs"
              style={{
                background: "var(--surface-0)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border-default)",
              }}
              onClick={onStartLearn}
              title="Learn: press a physical button to map it"
              whileTap={{ scale: 0.96 }}
            >
              Learn
            </motion.button>
            <motion.button
              className="px-2 py-0.5 rounded text-xs"
              style={{
                background: "var(--surface-0)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border-default)",
              }}
              onClick={() => setEditing(true)}
              whileTap={{ scale: 0.96 }}
            >
              Edit
            </motion.button>
          </div>
        </div>
      )}
    </motion.div>
  );
};

function DiagramForDevice({
  type,
  highlight,
  learn,
  pressed,
  axes,
}: {
  type: ControllerType;
  highlight: string | null;
  learn: string | null;
  pressed?: string[];
  axes?: Record<string, number>;
}) {
  if (type === "xbox")
    return (
      <XboxController
        highlightCode={highlight}
        learnCode={learn}
        pressedCodes={pressed}
        axes={axes}
      />
    );
  if (type === "ps4" || type === "ps5") {
    if (axes?.touchpad_x !== undefined) {
      console.log("[DiagramForDevice] touchpad props", axes.touchpad_x, axes.touchpad_y);
    }
    return (
      <PS4Controller
        highlightCode={highlight}
        learnCode={learn}
        pressedCodes={pressed}
        axes={axes}
        touchpadX={axes?.touchpad_x}
        touchpadY={axes?.touchpad_y}
      />
    );
  }
  if (type === "ps1" || type === "ps2" || type === "ps3")
    return (
      <PS2Controller
        highlightCode={highlight}
        learnCode={learn}
        pressedCodes={pressed}
        axes={axes}
      />
    );
  if (type === "gamecube")
    return (
      <GameCubeController
        highlightCode={highlight}
        learnCode={learn}
        pressedCodes={pressed}
        axes={axes}
      />
    );
  if (type === "n64")
    return (
      <N64Controller
        highlightCode={highlight}
        learnCode={learn}
        pressedCodes={pressed}
        axes={axes}
      />
    );
  if (type === "switch")
    return (
      <SwitchController
        highlightCode={highlight}
        learnCode={learn}
        pressedCodes={pressed}
        axes={axes}
      />
    );
  if (type === "wiimote")
    return (
      <WiiController
        highlightCode={highlight}
        learnCode={learn}
        pressedCodes={pressed}
        axes={axes}
      />
    );
  /* Fallback — generic / unknown controllers still show a diagram */
  return (
    <XboxController
      highlightCode={highlight}
      learnCode={learn}
      pressedCodes={pressed}
      axes={axes}
    />
  );
}

/* ── Wii device grouping ── */
interface DeviceGroup {
  device: ControllerDevice;
  members: ControllerDevice[];
}

function groupDevices(devices: ControllerDevice[]): DeviceGroup[] {
  const result: DeviceGroup[] = [];
  const wiimoteDevices = devices.filter((d) => d.type === "wiimote");
  const otherDevices = devices.filter((d) => d.type !== "wiimote");

  const groups = new Map<string, ControllerDevice[]>();
  for (const dev of wiimoteDevices) {
    const key = dev.physPath ?? "unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(dev);
  }

  for (const [physPath, members] of groups) {
    const main =
      members.find((d) => d.name.toLowerCase().includes("wii remote") && !d.name.toLowerCase().includes("accelerometer") && !d.name.toLowerCase().includes("ir") && !d.name.toLowerCase().includes("nunchuk")) ??
      members[0];
    result.push({
      device: {
        ...main,
        id: `wiimote-group:${physPath}`,
        name: "Wii Remote",
        buttonCount: members.reduce((s, d) => s + d.buttonCount, 0),
        axisCount: members.reduce((s, d) => s + d.axisCount, 0),
      },
      members,
    });
  }

  for (const dev of otherDevices) {
    result.push({ device: dev, members: [dev] });
  }

  return result;
}

function isWiimoteGroup(device: ControllerDevice | null): boolean {
  return !!device && device.id.startsWith("wiimote-group:");
}

function getGroupMembers(
  device: ControllerDevice | null,
  allDevices: ControllerDevice[],
): ControllerDevice[] {
  if (!device || !isWiimoteGroup(device)) return device ? [device] : [];
  const physPath = device.id.replace("wiimote-group:", "");
  return allDevices.filter(
    (d) => d.type === "wiimote" && (d.physPath ?? "unknown") === physPath,
  );
}

function aggregateLiveState(
  members: ControllerDevice[],
  liveStates: Record<string, LiveControllerState>,
): LiveControllerState | null {
  if (members.length === 0) return null;
  // Exclude accelerometer and IR devices — their axes pollute the gamepad state
  const gamepadMembers = members.filter(
    (m) => !m.name.toLowerCase().includes("accelerometer") && !m.name.toLowerCase().includes(" ir"),
  );
  const states = gamepadMembers.map((m) => liveStates[m.id]).filter(Boolean) as LiveControllerState[];
  if (states.length === 0) return null;
  const buttons: Record<string, boolean> = {};
  const axes: Record<string, number> = {};
  for (const s of states) {
    for (const [k, v] of Object.entries(s.buttons)) {
      if (v) buttons[k] = true;
    }
    for (const [k, v] of Object.entries(s.axes)) {
      axes[k] = v;
    }
  }
  return {
    buttons,
    axes,
    lastUpdated: Math.max(...states.map((s) => s.lastUpdated)),
  };
}

function aggregateRawDiscovery(
  members: ControllerDevice[],
  rawDiscoveries: Record<string, import("../../store/input.store").RawInputDiscovery>,
): import("../../store/input.store").RawInputDiscovery | null {
  if (members.length === 0) return null;
  const gamepadMembers = members.filter(
    (m) => !m.name.toLowerCase().includes("accelerometer") && !m.name.toLowerCase().includes(" ir"),
  );
  const discs = gamepadMembers.map((m) => rawDiscoveries[m.id]).filter(Boolean) as import("../../store/input.store").RawInputDiscovery[];
  if (discs.length === 0) return null;
  const buttons: Record<number, string> = {};
  const axes: Record<number, { min: number; max: number; name: string }> = {};
  for (const d of discs) {
    for (const [k, v] of Object.entries(d.buttons)) {
      const num = Number(k);
      buttons[num] = v;
    }
    for (const [k, v] of Object.entries(d.axes)) {
      const num = Number(k);
      axes[num] = v;
    }
  }
  return { buttons, axes };
}

export const ControllersTab: React.FC = () => {
  const {
    devices,
    lastEvent,
    liveStates,
    rawDiscoveries,
    controllersTabLocked,
    controllersTabUnlockProgress,
  } = useInputStore();
  const [selectedDevice, setSelectedDevice] = useState<ControllerDevice | null>(
    null,
  );
  const [mappings, setMappings] = useState<ButtonMapping[]>([]);
  const [learningCode, setLearningCode] = useState<string | null>(null);
  const [learnedRaw, setLearnedRaw] = useState<number | null>(null);
  const [learnedDeviceId, setLearnedDeviceId] = useState<string | null>(null);
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [rawExpanded, setRawExpanded] = useState(false);
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const learningRef = useRef<string | null>(null);
  learningRef.current = learningCode;

  /* ── Event-rate tracking for debug spam-detection ── */
  const eventHistoryRef = useRef<{
    byInput: Map<string, number[]>;
    byDevice: Map<string, number[]>;
  }>({ byInput: new Map(), byDevice: new Map() });
  const [eventRates, setEventRates] = useState<{
    inputHz: number;
    deviceHz: number;
  }>({ inputHz: 0, deviceHz: 0 });

  const grouped = groupDevices(devices);
  const groupMembers = getGroupMembers(selectedDevice, devices);

  const liveState: LiveControllerState | null = selectedDevice
    ? isWiimoteGroup(selectedDevice)
      ? aggregateLiveState(groupMembers, liveStates)
      : (liveStates[selectedDevice.id] ?? null)
    : null;

  const rawDiscovery = selectedDevice
    ? isWiimoteGroup(selectedDevice)
      ? aggregateRawDiscovery(groupMembers, rawDiscoveries)
      : (rawDiscoveries[selectedDevice.id] ?? null)
    : null;

  useEffect(() => {
    if (grouped.length > 0 && !selectedDevice) setSelectedDevice(grouped[0].device);
  }, [grouped]);

  useEffect(() => {
    async function loadAliases() {
      const next: Record<string, string> = {};
      const aliasIds = new Set<string>();
      for (const dev of devices) aliasIds.add(dev.id);
      for (const g of grouped) {
        for (const m of g.members) aliasIds.add(m.id);
      }
      await Promise.all(
        Array.from(aliasIds).map(async (id) => {
          const alias = await window.htpc.input.getAlias(id);
          if (alias) next[id] = alias;
        }),
      );
      setAliases(next);
    }
    void loadAliases();
  }, [devices.map((d) => d.id).join(",")]);

  useEffect(() => {
    if (!selectedDevice) return;
    if (isWiimoteGroup(selectedDevice) && groupMembers.length > 0) {
      Promise.all(groupMembers.map((m) => window.htpc.input.getMappings(m.id)))
        .then((results) => {
          const merged: ButtonMapping[] = [];
          const seen = new Set<string>();
          for (const result of results) {
            for (const m of result) {
              if (!seen.has(m.inputCode)) {
                seen.add(m.inputCode);
                merged.push(m);
              }
            }
          }
          setMappings(merged);
        });
    } else {
      window.htpc.input.getMappings(selectedDevice.id).then(setMappings);
    }
    setLearningCode(null);
    setLearnedRaw(null);
    setLearnedDeviceId(null);
  }, [selectedDevice]);

  useEffect(() => {
    if (learningCode) {
      useInputStore.getState().setControllersTabLocked(true);
      useInputStore.getState().setControllersTabUnlockProgress(0);
    } else {
      useInputStore.getState().setControllersTabLocked(false);
      useInputStore.getState().setControllersTabUnlockProgress(0);
    }
  }, [learningCode]);

  useEffect(() => {
    if (!learningCode || !selectedDevice) {
      setLearningDeviceIds([]);
      return;
    }
    const targetIds = isWiimoteGroup(selectedDevice)
      ? groupMembers.map((m) => m.id)
      : [selectedDevice.id];
    setLearningDeviceIds(targetIds);
    const unsub = subscribeLearning((ev) => {
      if (learningRef.current && ev.rawCode !== undefined) {
        setLearnedRaw(ev.rawCode);
        setLearnedDeviceId(ev.deviceId ?? null);
      }
    });
    return () => {
      unsub();
      setLearningDeviceIds([]);
    };
  }, [learningCode, selectedDevice]);

  useEffect(() => {
    if (!lastEvent) return;
    const now = Date.now();
    const hist = eventHistoryRef.current;

    const inputKey = `${lastEvent.deviceId}:${lastEvent.action ?? lastEvent.axis ?? lastEvent.rawCode ?? "event"}`;
    const inputArr = hist.byInput.get(inputKey) ?? [];
    inputArr.push(now);
    hist.byInput.set(inputKey, inputArr);

    const devArr = hist.byDevice.get(lastEvent.deviceId) ?? [];
    devArr.push(now);
    hist.byDevice.set(lastEvent.deviceId, devArr);

    const WINDOW_MS = 1000;
    const cutoff = now - WINDOW_MS;

    for (const [k, arr] of hist.byInput) {
      const filtered = arr.filter((t) => t > cutoff);
      if (filtered.length === 0) hist.byInput.delete(k);
      else hist.byInput.set(k, filtered);
    }
    for (const [k, arr] of hist.byDevice) {
      const filtered = arr.filter((t) => t > cutoff);
      if (filtered.length === 0) hist.byDevice.delete(k);
      else hist.byDevice.set(k, filtered);
    }

    const inputHz = (hist.byInput.get(inputKey)?.length ?? 0);
    const deviceHz = (hist.byDevice.get(lastEvent.deviceId)?.length ?? 0);
    setEventRates({ inputHz, deviceHz });
  }, [lastEvent]);

  const saveMapping = useCallback(
    (inputCode: string, action: string, rawCode?: number | null): void => {
      if (!selectedDevice) return;
      const codeToSave =
        rawCode !== null && rawCode !== undefined ? String(rawCode) : inputCode;
      let targetDeviceId: string;
      if (isWiimoteGroup(selectedDevice)) {
        if (learnedDeviceId) {
          targetDeviceId = learnedDeviceId;
        } else {
          targetDeviceId = groupMembers[0]?.id ?? selectedDevice.id;
        }
      } else {
        targetDeviceId = selectedDevice.id;
      }
      window.htpc.input.setMapping(targetDeviceId, codeToSave, action);
      setMappings((prev) => {
        const idx = prev.findIndex((m) => m.inputCode === codeToSave);
        const entry: ButtonMapping = {
          deviceId: targetDeviceId,
          inputCode: codeToSave,
          action,
        };
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = entry;
          return next;
        }
        return [...prev, entry];
      });
    },
    [selectedDevice, learnedDeviceId, groupMembers],
  );

  const resetMappings = async (): Promise<void> => {
    if (!selectedDevice) return;
    if (isWiimoteGroup(selectedDevice) && groupMembers.length > 0) {
      await Promise.all(
        groupMembers.map((m) => window.htpc.input.resetMappings(m.id)),
      );
    } else {
      await window.htpc.input.resetMappings(selectedDevice.id);
    }
    setMappings([]);
    setConfirmReset(false);
  };

  const startLearn = (code: string): void => {
    setLearningCode(code);
    setLearnedRaw(null);
  };

  const cancelLearn = (): void => {
    setLearningCode(null);
    setLearnedRaw(null);
  };

  const deviceItems = grouped.map((g) => g.device);
  const deviceFocusedIndex = deviceItems.findIndex(
    (d) => d.id === selectedDevice?.id,
  );

  const { menu: deviceCtxMenu, bindItem: bindDeviceItem } = useContextMenu({
    items: deviceItems,
    focusedIndex: Math.max(0, deviceFocusedIndex),
    getOptions: (dev): ContextMenuOption[] => {
      const opts: ContextMenuOption[] = [
        {
          id: "rename",
          label: aliases[dev.id] ? "Edit Name" : "Rename",
          icon: <Pencil size={16} />,
        },
        {
          id: "reconnect",
          label: "Reconnect / Resync",
          icon: <RefreshCw size={16} />,
        },
      ];
      if (devToolsOpen) {
        opts.push({
          id: "copy-id",
          label: "Copy ID",
          icon: <Copy size={16} />,
        });
        opts.push({
          id: "debug",
          label: "Debug",
          icon: <Bug size={16} />,
        });
      }
      const path = isWiimoteGroup(dev)
        ? getGroupMembers(dev, devices)[0]?.id ?? dev.id
        : dev.id;
      opts.push({
        id: "__sep__path",
        label: path,
        header: true,
      });
      return opts;
    },
    onAction: (dev, optionId) => {
      const members = getGroupMembers(dev, devices);
      const aliasTargetId = members.length > 1 ? members[0].id : dev.id;
      switch (optionId) {
        case "rename": {
          const current = aliases[aliasTargetId] ?? dev.name;
          const name = window.prompt("Controller name:", current);
          if (name === null) return;
          const trimmed = name.trim();
          if (trimmed === "" || trimmed === dev.name) {
            if (aliases[aliasTargetId]) {
              window.htpc.input.removeAlias(aliasTargetId).then(() => {
                setAliases((prev) => {
                  const next = { ...prev };
                  delete next[aliasTargetId];
                  return next;
                });
              });
            }
            return;
          }
          window.htpc.input.setAlias(aliasTargetId, trimmed).then(() => {
            setAliases((prev) => ({ ...prev, [aliasTargetId]: trimmed }));
          });
          break;
        }
        case "reconnect": {
          for (const m of members) {
            void window.htpc.input.reconnectDevice(m.id);
          }
          break;
        }
        case "copy-id": {
          void navigator.clipboard.writeText(dev.id);
          break;
        }
        case "debug": {
          // eslint-disable-next-line no-console
          console.log("Controller device:", dev, "members:", members);
          break;
        }
      }
    },
  });

  const hasDiagram =
    selectedDevice &&
    (selectedDevice.type === "xbox" ||
      selectedDevice.type === "ps4" ||
      selectedDevice.type === "ps5" ||
      selectedDevice.type === "ps1" ||
      selectedDevice.type === "ps2" ||
      selectedDevice.type === "ps3" ||
      selectedDevice.type === "gamecube" ||
      selectedDevice.type === "n64" ||
      selectedDevice.type === "switch" ||
      selectedDevice.type === "wiimote");

  return (
    <div className="h-full flex gap-4 p-4 overflow-hidden">
      {/* Sidebar */}
      <div className="w-60 flex-shrink-0 flex flex-col gap-3">
        <h2
          className="text-base font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Devices
        </h2>

        {deviceItems.length === 0 ? (
          <div
            className="text-sm text-center py-8"
            style={{ color: "var(--text-secondary)" }}
          >
            No controllers detected.
            <br />
            <span className="text-xs opacity-60">
              User must be in the <code>input</code> group.
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {deviceItems.map((dev, index) => {
              const members = getGroupMembers(dev, devices);
              const aliasId = members.length > 1 ? members[0].id : dev.id;
              return (
                <motion.button
                  key={dev.id}
                  className="flex gap-3 items-center p-3 rounded-[var(--radius-card)] text-left"
                  style={{
                    background:
                      selectedDevice?.id === dev.id
                        ? "var(--surface-1)"
                        : "var(--surface-0)",
                    border: `1px solid ${selectedDevice?.id === dev.id ? "var(--accent)" : "var(--border-default)"}`,
                    boxShadow:
                      selectedDevice?.id === dev.id
                        ? "var(--shadow-glow)"
                        : "none",
                  }}
                  onClick={() => setSelectedDevice(dev)}
                  whileTap={{ scale: 0.98 }}
                  {...bindDeviceItem(dev, index)}
                >
                  <div className="relative shrink-0">
                    {CONTROLLER_ICONS[dev.type]}
                    {dev.connectionType && (
                      <span
                        className="absolute -bottom-0.5 -right-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full"
                        style={{
                          background: "var(--surface-1)",
                          border: "1px solid var(--border-default)",
                        }}
                        title={CONNECTION_LABELS[dev.connectionType]}
                      >
                        {React.cloneElement(
                          CONNECTION_ICONS[dev.connectionType] as React.ReactElement,
                          { size: 10 },
                        )}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span
                      className="text-sm font-medium truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {aliases[aliasId] ?? dev.name}
                    </span>
                    <span
                      className="text-[12px] capitalize"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {dev.type}
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}

        <BluetoothQuickConnect />

        {lastEvent && (
          <div
            className="mt-auto p-3 rounded-[var(--radius-card)] text-xs"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
            }}
          >
            <div
              className="font-medium mb-1"
              style={{ color: "var(--accent)" }}
            >
              Last Input
            </div>
            <div style={{ color: "var(--text-secondary)" }}>
              <div className="truncate" title={lastEvent.deviceName}>
                Name: {lastEvent.deviceName}
              </div>
              <div className="truncate" title={lastEvent.deviceId}>
                Path: {lastEvent.deviceId}
              </div>
              <div>Input: {lastEvent.action ?? lastEvent.axis ?? `raw-${lastEvent.rawCode}`}</div>
              {lastEvent.rawCode !== undefined && (
                <div>Raw: {lastEvent.rawCode}</div>
              )}
              {lastEvent.value !== undefined && (
                <div>Value: {lastEvent.value.toFixed(3)}</div>
              )}
              <div className="flex gap-2 mt-1">
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[12px] font-mono"
                  style={{
                    background:
                      eventRates.inputHz > 30
                        ? "color-mix(in srgb, #f87171 20%, var(--surface-0))"
                        : "var(--surface-0)",
                    color:
                      eventRates.inputHz > 30 ? "#f87171" : "var(--text-secondary)",
                    border: "1px solid var(--border-default)",
                  }}
                  title="Events/sec for this specific input (spam indicator)"
                >
                  {eventRates.inputHz} Hz
                </span>
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[12px] font-mono"
                  style={{
                    background: "var(--surface-0)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border-default)",
                  }}
                  title="Events/sec for this whole device"
                >
                  dev {eventRates.deviceHz} Hz
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main panel */}
      <div className="flex-1 overflow-y-auto gpu-scroll">
        {selectedDevice ? (
          <div className="flex flex-col gap-3">
            {/* Header */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {CONTROLLER_ICONS[selectedDevice.type]}
                <div className="flex flex-col gap-1">
                  <h2
                    className="text-lg font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {aliases[selectedDevice.id] ?? selectedDevice.name}
                  </h2>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                    <span className="capitalize">{selectedDevice.type}</span>
                    <span>·</span>
                    <span>{selectedDevice.buttonCount}b {selectedDevice.axisCount}ax</span>
                    {selectedDevice.vendorId && (
                      <>
                        <span>·</span>
                        <span className="font-mono">
                          {selectedDevice.vendorId.toString(16).padStart(4, "0")}:{selectedDevice.productId?.toString(16).padStart(4, "0")}
                        </span>
                      </>
                    )}
                    {selectedDevice.connectionType && (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1 capitalize">
                          {CONNECTION_ICONS[selectedDevice.connectionType]}
                          {CONNECTION_LABELS[selectedDevice.connectionType]}
                        </span>
                      </>
                    )}
                    {selectedDevice.latencyMs !== undefined && (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1" title="Average event latency">
                          <Zap size={12} />
                          {selectedDevice.latencyMs} ms
                        </span>
                      </>
                    )}
                    {selectedDevice.signalStrengthPercent !== undefined && (
                      <>
                        <span>·</span>
                        <SignalStrengthBar pct={selectedDevice.signalStrengthPercent} />
                      </>
                    )}
                    {selectedDevice.batteryPercent !== undefined && (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1" title={`Battery ${selectedDevice.batteryPercent}%`}>
                          <BatteryIcon level={selectedDevice.batteryPercent} />
                          {selectedDevice.batteryPercent}%
                        </span>
                      </>
                    )}
                    {selectedDevice.driverName && (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1" title="Linux input driver">
                          <Cpu size={12} />
                          {selectedDevice.driverName}
                        </span>
                      </>
                    )}
                    {selectedDevice.connectedAt && (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1" title="Connected for">
                          <Clock size={12} />
                          {formatDuration(Date.now() - selectedDevice.connectedAt)}
                        </span>
                      </>
                    )}
                    {selectedDevice.lastActivityAt && (
                      <>
                        <span>·</span>
                        <span title="Last input activity">
                          idle {formatDuration(Date.now() - selectedDevice.lastActivityAt)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              {/* Reset to default */}
              <AnimatePresence mode="wait">
                {confirmReset ? (
                  <motion.div
                    key="confirm"
                    className="flex gap-2 items-center"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                  >
                    <span
                      className="text-xs"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Clear all mappings?
                    </span>
                    <motion.button
                      className="px-3 py-1 rounded text-xs"
                      style={{ background: "#e05252", color: "#fff" }}
                      onClick={resetMappings}
                      whileTap={{ scale: 0.96 }}
                    >
                      Confirm
                    </motion.button>
                    <motion.button
                      className="px-2 py-1 rounded text-xs"
                      style={{
                        background: "var(--surface-0)",
                        color: "var(--text-secondary)",
                        border: "1px solid var(--border-default)",
                      }}
                      onClick={() => setConfirmReset(false)}
                      whileTap={{ scale: 0.96 }}
                    >
                      Cancel
                    </motion.button>
                  </motion.div>
                ) : (
                  <motion.button
                    key="reset"
                    className="px-3 py-1.5 rounded text-xs"
                    style={{
                      background: "var(--surface-0)",
                      color: "var(--text-secondary)",
                      border: "1px solid var(--border-default)",
                    }}
                    onClick={() => setConfirmReset(true)}
                    whileTap={{ scale: 0.96 }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    Reset to Default
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {/* Controller lock / unlock prompt */}
            <AnimatePresence>
              {controllersTabLocked && (
                <motion.div
                  className="flex flex-col gap-2 px-4 py-3 rounded text-sm"
                  style={{
                    background:
                      "color-mix(in srgb, var(--accent) 12%, var(--surface-0))",
                    border: "1px solid var(--accent)",
                  }}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <div className="flex items-center gap-2">
                    <Lock size={16} style={{ color: "var(--accent)" }} />
                    <span style={{ color: "var(--text-primary)" }}>
                      Controller navigation is <strong>locked</strong> while
                      viewing this tab.
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      Hold <strong>{getButtonLabel(selectedDevice.type, "west")}</strong> for 5 seconds to unlock
                    </span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-1)" }}>
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: "var(--accent)" }}
                        animate={{ width: `${controllersTabUnlockProgress * 100}%` }}
                        transition={{ duration: 0.05 }}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
              {!controllersTabLocked && (
                <motion.div
                  className="flex items-center gap-2 px-4 py-2 rounded text-sm"
                  style={{
                    background:
                      "color-mix(in srgb, #5bba47 12%, var(--surface-0))",
                    border: "1px solid #5bba47",
                  }}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <Unlock size={16} style={{ color: "#5bba47" }} />
                  <span style={{ color: "var(--text-primary)" }}>
                    Controller navigation <strong>unlocked</strong>
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* SVG diagram */}
            {hasDiagram && (
              <button
                className="w-full rounded-[var(--radius-card)] p-4 md:p-5 text-left"
                style={{
                  background: "var(--surface-0)",
                  border: "1px solid var(--border-default)",
                }}
                tabIndex={0}
                onClick={() => {
                  useInputStore.getState().setControllersTabLocked(true);
                  useInputStore.getState().setControllersTabUnlockProgress(0);
                }}
                title="Click to lock controller navigation"
              >
                <DiagramForDevice
                  type={selectedDevice.type}
                  highlight={hoveredCode}
                  learn={learningCode}
                  pressed={
                    liveState
                      ? Object.entries(liveState.buttons)
                          .filter(([, v]) => v)
                          .map(([k]) => k)
                      : undefined
                  }
                  axes={liveState?.axes}
                />
              </button>
            )}

            {/* Live input readout */}
            {liveState && (
              <div
                className="rounded-[var(--radius-card)] p-4 flex flex-col gap-3"
                style={{
                  background: "var(--surface-0)",
                  border: "1px solid var(--border-default)",
                }}
              >
                <h3
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Live Input
                </h3>
                {/* Buttons */}
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {BUTTON_CODES.map((code) => {
                    const pressed = liveState.buttons[code] ?? false;
                    return (
                      <div
                        key={code}
                        className="flex flex-col items-center gap-1 p-2 rounded"
                        style={{
                          background: pressed
                            ? "color-mix(in srgb, var(--accent) 25%, var(--surface-1))"
                            : "var(--surface-1)",
                          border: `1px solid ${pressed ? "var(--accent)" : "var(--border-default)"}`,
                        }}
                      >
                        <span
                          className="text-[12px] font-medium uppercase"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {selectedDevice && getButtonLabel(selectedDevice.type, code)}
                        </span>
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{
                            background: pressed
                              ? "var(--accent)"
                              : "var(--border-default)",
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
                {/* Axes */}
                {Object.keys(liveState.axes).length > 0 && (
                  <div className="flex flex-col gap-2">
                    {Object.entries(liveState.axes).map(([axis, value]) => {
                      const isTrigger = axis.includes("trigger");
                      const normalized = isTrigger
                        ? Math.max(0, Math.min(1, value ?? 0))
                        : Math.max(-1, Math.min(1, value ?? 0));
                      if (isTrigger) {
                        const pct = normalized * 100;
                        return (
                          <div key={axis} className="flex items-center gap-3">
                            <span
                              className="text-[12px] font-mono uppercase w-20 shrink-0"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {axis}
                            </span>
                            <div className="flex-1 h-3 rounded-full relative overflow-hidden" style={{ background: "var(--surface-1)" }}>
                              <div
                                className="absolute top-0 bottom-0 left-0 rounded-full transition-all"
                                style={{
                                  width: `${pct}%`,
                                  background: pct < 5 ? "var(--border-default)" : "var(--accent)",
                                }}
                              />
                            </div>
                            <span
                              className="text-[12px] font-mono w-10 text-right shrink-0"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {typeof value === "number" ? value.toFixed(2) : value}
                            </span>
                          </div>
                        );
                      }
                      const isCenter = Math.abs(normalized) < 0.05;
                      const pct = ((normalized + 1) / 2) * 100;
                      return (
                        <div key={axis} className="flex items-center gap-3">
                          <span
                            className="text-[12px] font-mono uppercase w-20 shrink-0"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {axis}
                          </span>
                          <div className="flex-1 h-3 rounded-full relative overflow-hidden" style={{ background: "var(--surface-1)" }}>
                            <div
                              className="absolute top-0 bottom-0 rounded-full transition-all"
                              style={{
                                left: "50%",
                                width: isCenter ? "2px" : `${Math.abs(pct - 50) * 2}%`,
                                background: isCenter
                                  ? "var(--border-default)"
                                  : "var(--accent)",
                                transform: isCenter
                                  ? "translateX(-1px)"
                                  : normalized >= 0
                                    ? "none"
                                    : `translateX(-${Math.abs(pct - 50) * 2}%) translateX(-100%)`,
                              }}
                            />
                            <div
                              className="absolute top-0 bottom-0 w-0.5 rounded-full"
                              style={{
                                left: "50%",
                                background: "var(--text-secondary)",
                                transform: "translateX(-50%)",
                              }}
                            />
                          </div>
                          <span
                            className="text-[12px] font-mono w-10 text-right shrink-0"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {typeof value === "number" ? value.toFixed(2) : value}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Learn mode banner */}
            <AnimatePresence>
              {learningCode && (
                <motion.div
                  className="flex items-center gap-3 px-4 py-2 rounded text-sm"
                  style={{
                    background:
                      "color-mix(in srgb, var(--accent) 22%, var(--surface-0))",
                    border: "1px solid var(--accent)",
                  }}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <span style={{ color: "var(--accent)" }}>●</span>
                  <span style={{ color: "var(--text-primary)" }}>
                    Learning{" "}
                    <strong>
                      {selectedDevice && getButtonLabel(selectedDevice.type, learningCode)}
                    </strong>{" "}
                    — press any button on the controller
                    {learnedRaw !== null && (
                      <span style={{ color: "var(--accent)" }}>
                        {" "}
                        · raw code: {learnedRaw}
                      </span>
                    )}
                  </span>
                  <motion.button
                    className="ml-auto px-2 py-0.5 rounded text-xs"
                    style={{
                      background: "var(--surface-0)",
                      color: "var(--text-secondary)",
                      border: "1px solid var(--border-default)",
                    }}
                    onClick={cancelLearn}
                    whileTap={{ scale: 0.96 }}
                  >
                    Cancel
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Mappings list */}
            <h3
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-secondary)" }}
            >
              Button Mappings
            </h3>
            <div className="flex flex-col gap-1.5">
              {BUTTON_CODES.map((code) => {
                const mapping = mappings.find((m) => m.inputCode === code);
                return (
                  <MappingRow
                    key={code}
                    inputCode={code}
                    currentAction={mapping?.action ?? ""}
                    controllerType={selectedDevice.type}
                    isLearning={learningCode === code}
                    learnedRaw={learningCode === code ? learnedRaw : null}
                    onStartLearn={() => startLearn(code)}
                    onCancelLearn={cancelLearn}
                    onSave={(action) =>
                      saveMapping(
                        code,
                        action,
                        learningCode === code ? learnedRaw : null,
                      )
                    }
                    onHover={setHoveredCode}
                  />
                );
              })}
            </div>

            {/* Unknown Inputs */}
            {selectedDevice &&
              rawDiscovery &&
              (() => {
                const disc = rawDiscovery;
                const unknownButtons = Object.entries(disc.buttons).filter(
                  ([, name]) => !isKnownButton(name),
                );
                const unknownAxes = Object.entries(disc.axes).filter(
                  ([, info]) => !isKnownAxis(info.name),
                );
                if (unknownButtons.length === 0 && unknownAxes.length === 0)
                  return null;
                return (
                  <div className="flex flex-col gap-2">
                    <h3
                      className="text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Unknown Inputs
                    </h3>
                    <div className="flex flex-col gap-1.5">
                      {unknownButtons.map(([rawCode, name]) => (
                        <div
                          key={`unknown-btn-${rawCode}`}
                          className="flex items-center justify-between py-2 px-3 rounded gap-2"
                          style={{
                            background: "var(--surface-1)",
                            border: "1px solid var(--border-default)",
                          }}
                        >
                          <span
                            className="text-sm font-mono w-28 shrink-0"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {name}
                          </span>
                          <span
                            className="text-xs ml-auto"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            raw {rawCode}
                          </span>
                        </div>
                      ))}
                      {unknownAxes.map(([rawCode, info]) => (
                        <div
                          key={`unknown-axis-${rawCode}`}
                          className="flex items-center justify-between py-2 px-3 rounded gap-2"
                          style={{
                            background: "var(--surface-1)",
                            border: "1px solid var(--border-default)",
                          }}
                        >
                          <span
                            className="text-sm font-mono w-28 shrink-0"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {info.name}
                          </span>
                          <span
                            className="text-xs ml-auto"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            raw {rawCode} &middot; range{" "}
                            {info.min.toFixed(2)} .. {info.max.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

            {/* Raw Input (collapsed) */}
            {selectedDevice && rawDiscovery && (
              <div className="flex flex-col gap-2">
                <button
                  className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-secondary)" }}
                  onClick={() => setRawExpanded((v) => !v)}
                >
                  {rawExpanded ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                  Raw Input
                </button>
                <AnimatePresence>
                  {rawExpanded && (
                    <motion.div
                      className="flex flex-col gap-1.5"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      {Object.entries(
                        rawDiscovery.buttons,
                      ).map(([rawCode, name]) => (
                        <div
                          key={`raw-btn-${rawCode}`}
                          className="flex items-center justify-between py-1.5 px-3 rounded gap-2"
                          style={{
                            background: "var(--surface-1)",
                            border: "1px solid var(--border-default)",
                          }}
                        >
                          <span
                            className="text-xs font-mono"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {name}
                          </span>
                          <span
                            className="text-[12px]"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            button &middot; raw {rawCode}
                          </span>
                        </div>
                      ))}
                      {Object.entries(
                        rawDiscovery.axes,
                      ).map(([rawCode, info]) => (
                        <div
                          key={`raw-axis-${rawCode}`}
                          className="flex items-center justify-between py-1.5 px-3 rounded gap-2"
                          style={{
                            background: "var(--surface-1)",
                            border: "1px solid var(--border-default)",
                          }}
                        >
                          <span
                            className="text-xs font-mono"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {info.name}
                          </span>
                          <span
                            className="text-[12px]"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            axis &middot; raw {rawCode} &middot; range{" "}
                            {info.min.toFixed(3)} .. {info.max.toFixed(3)}
                          </span>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        ) : (
          <div
            className="h-full flex items-center justify-center"
            style={{ color: "var(--text-secondary)" }}
          >
            Select a controller to configure it.
          </div>
        )}
      </div>
      {deviceCtxMenu}
    </div>
  );
};

function BluetoothQuickConnect() {
  const [expanded, setExpanded] = useState(false);
  const [available, setAvailable] = useState(false);
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const avail = await window.htpc.bluetooth.available();
    setAvailable(avail);
    if (avail) {
      const devs = await window.htpc.bluetooth.devices();
      setDevices(devs);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleScan = useCallback(async () => {
    setScanning(true);
    try {
      const found = await window.htpc.bluetooth.scan(8);
      setDevices(found);
    } catch { /* ignore */ }
    setScanning(false);
  }, []);

  const handleAction = useCallback(async (
    action: string,
    mac: string,
    fn: (mac: string) => Promise<boolean>,
  ) => {
    setBusy(`${action}:${mac}`);
    const ok = await fn(mac);
    if (ok) await refresh();
    setBusy(null);
  }, [refresh]);

  if (!available) return null;

  return (
    <div className="flex flex-col gap-2">
      <motion.button
        className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-card)] text-sm font-medium"
        style={{
          background: "var(--surface-0)",
          border: "1px solid var(--border-default)",
          color: "var(--text-primary)",
        }}
        onClick={() => {
          setExpanded((v) => !v);
          if (!expanded) void refresh();
        }}
        whileTap={{ scale: 0.98 }}
      >
        <Bluetooth size={16} style={{ color: "var(--accent)" }} />
        <span className="flex-1 text-left">Bluetooth</span>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </motion.button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            className="flex flex-col gap-2"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="flex items-center gap-2">
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleScan}
                disabled={scanning}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium flex-1"
                style={{
                  background: scanning ? "var(--surface-1)" : "var(--accent)",
                  color: scanning ? "var(--text-secondary)" : "var(--surface-base)",
                  border: `1px solid ${scanning ? "var(--border-default)" : "var(--accent)"}`,
                }}
              >
                {scanning ? (
                  <>
                    <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <Search size={12} />
                    Scan
                  </>
                )}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={refresh}
                className="flex items-center gap-1 px-2 py-1.5 rounded text-xs"
                style={{
                  background: "var(--surface-1)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border-default)",
                }}
              >
                <RefreshCw size={12} />
              </motion.button>
            </div>

            {devices.length > 0 ? (
              <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                {devices.map((dev) => (
                  <div
                    key={dev.mac}
                    className="flex flex-col gap-1 p-2 rounded"
                    style={{
                      background: "var(--surface-0)",
                      border: dev.connected
                        ? "1px solid #4ade8040"
                        : "1px solid var(--border-default)",
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="text-xs font-medium truncate flex-1"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {dev.name}
                      </span>
                      {dev.connected && (
                        <span
                          className="text-[12px] px-1 py-0.5 rounded shrink-0"
                          style={{ background: "#4ade8020", color: "#4ade80" }}
                        >
                          Connected
                        </span>
                      )}
                      {dev.paired && !dev.connected && (
                        <span
                          className="text-[12px] px-1 py-0.5 rounded shrink-0"
                          style={{ background: "var(--surface-1)", color: "var(--text-secondary)" }}
                        >
                          Paired
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {!dev.paired && (
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleAction("pair", dev.mac, window.htpc.bluetooth.pair)}
                          disabled={busy === `pair:${dev.mac}`}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[12px] font-medium"
                          style={{ background: "var(--accent)", color: "var(--surface-base)" }}
                        >
                          <Link2 size={12} /> Pair
                        </motion.button>
                      )}
                      {dev.paired && !dev.connected && (
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleAction("connect", dev.mac, window.htpc.bluetooth.connect)}
                          disabled={busy === `connect:${dev.mac}`}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[12px] font-medium"
                          style={{ background: "#4ade80", color: "#000" }}
                        >
                          <Link2 size={12} /> Connect
                        </motion.button>
                      )}
                      {dev.connected && (
                        <>
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleAction("reconnect", dev.mac, window.htpc.bluetooth.reconnect)}
                            disabled={busy === `reconnect:${dev.mac}`}
                            className="flex items-center gap-1 px-2 py-1 rounded text-[12px] font-medium"
                            style={{ background: "var(--surface-1)", color: "var(--text-primary)", border: "1px solid var(--border-default)" }}
                          >
                            <RefreshCw size={12} /> Reconnect
                          </motion.button>
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleAction("disconnect", dev.mac, window.htpc.bluetooth.disconnect)}
                            disabled={busy === `disconnect:${dev.mac}`}
                            className="flex items-center gap-1 px-2 py-1 rounded text-[12px] font-medium"
                            style={{ background: "#ff444420", color: "#ff6666" }}
                          >
                            <Unlink size={12} />
                          </motion.button>
                        </>
                      )}
                      {dev.paired && (
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleAction("remove", dev.mac, window.htpc.bluetooth.remove)}
                          disabled={busy === `remove:${dev.mac}`}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[12px] font-medium"
                          style={{ background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}
                          title="Forget device"
                        >
                          <Trash2 size={12} /> Forget
                        </motion.button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="text-xs text-center py-3"
                style={{ color: "var(--text-secondary)" }}
              >
                No devices found. Click Scan.
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
