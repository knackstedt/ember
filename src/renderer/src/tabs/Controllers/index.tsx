import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gamepad2, Lock, Unlock } from "lucide-react";
import { useInputStore } from "../../store/input.store";
import type { LiveControllerState } from "../../store/input.store";
import {
  ControllerDevice,
  ControllerType,
  ButtonMapping,
  NormalizedInputEvent,
} from "../../../../shared/types";
import { XboxController } from "./XboxController";
import { PS4Controller } from "./PS4Controller";

const CONTROLLER_ICON_SIZE = 28;

const CONTROLLER_ICONS: Record<ControllerType, React.ReactNode> = {
  xbox: <Gamepad2 size={CONTROLLER_ICON_SIZE} />,
  ps1: <Gamepad2 size={CONTROLLER_ICON_SIZE} />,
  ps2: <Gamepad2 size={CONTROLLER_ICON_SIZE} />,
  ps3: <Gamepad2 size={CONTROLLER_ICON_SIZE} />,
  ps4: <Gamepad2 size={CONTROLLER_ICON_SIZE} />,
  ps5: <Gamepad2 size={CONTROLLER_ICON_SIZE} />,
  gamecube: <Gamepad2 size={CONTROLLER_ICON_SIZE} />,
  wiimote: <Gamepad2 size={CONTROLLER_ICON_SIZE} />,
  generic: <Gamepad2 size={CONTROLLER_ICON_SIZE} />,
};

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

const BUTTON_LABELS: Record<string, string> = {
  south: "A / ✕",
  east: "B / ○",
  west: "X / □",
  north: "Y / △",
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
};

const BUTTON_CODES = Object.keys(BUTTON_LABELS);

interface MappingRowProps {
  inputCode: string;
  currentAction: string;
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
          ? "color-mix(in srgb, var(--color-accent) 18%, var(--color-surface-raised))"
          : "var(--color-surface-raised)",
        border: `1px solid ${isLearning ? "var(--color-accent)" : "var(--color-border)"}`,
        outline: isLearning ? "1px solid var(--color-accent)" : "none",
      }}
      animate={isLearning ? { opacity: [1, 0.6, 1] } : { opacity: 1 }}
      transition={isLearning ? { repeat: Infinity, duration: 0.9 } : {}}
      onMouseEnter={() => onHover(inputCode)}
      onMouseLeave={() => onHover(null)}
    >
      <span
        className="text-sm font-mono w-28 shrink-0"
        style={{ color: "var(--color-text)" }}
      >
        {BUTTON_LABELS[inputCode] ?? inputCode}
      </span>

      {isLearning ? (
        <div className="flex flex-1 items-center gap-2 justify-between">
          <span className="text-xs" style={{ color: "var(--color-accent)" }}>
            {learnedRaw !== null
              ? `Captured raw code ${learnedRaw} — save?`
              : "Press a button on the controller…"}
          </span>
          <div className="flex gap-2">
            {learnedRaw !== null && (
              <motion.button
                className="px-3 py-1 rounded text-xs"
                style={{
                  background: "var(--color-accent)",
                  color: "var(--color-bg)",
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
                background: "var(--color-surface)",
                color: "var(--color-text-dim)",
                border: "1px solid var(--color-border)",
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
              background: "var(--color-surface)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
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
                background: "var(--color-accent)",
                color: "var(--color-bg)",
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
                background: "var(--color-surface)",
                color: "var(--color-text-dim)",
                border: "1px solid var(--color-border)",
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
                ? "var(--color-accent)"
                : "var(--color-text-dim)",
            }}
          >
            {currentAction || "—"}
          </span>
          <div className="flex gap-1">
            <motion.button
              className="px-2 py-0.5 rounded text-xs"
              style={{
                background: "var(--color-surface)",
                color: "var(--color-text-dim)",
                border: "1px solid var(--color-border)",
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
                background: "var(--color-surface)",
                color: "var(--color-text-dim)",
                border: "1px solid var(--color-border)",
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
  if (type === "ps4" || type === "ps5" || type === "ps3")
    return (
      <PS4Controller
        highlightCode={highlight}
        learnCode={learn}
        pressedCodes={pressed}
        axes={axes}
      />
    );
  return null;
}

export const ControllersTab: React.FC = () => {
  const {
    devices,
    lastEvent,
    liveStates,
    controllersTabLocked,
    controllersTabUnlockProgress,
  } = useInputStore();
  const [selectedDevice, setSelectedDevice] = useState<ControllerDevice | null>(
    null,
  );
  const [mappings, setMappings] = useState<ButtonMapping[]>([]);
  const [learningCode, setLearningCode] = useState<string | null>(null);
  const [learnedRaw, setLearnedRaw] = useState<number | null>(null);
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const learningRef = useRef<string | null>(null);
  learningRef.current = learningCode;

  const liveState: LiveControllerState | null = selectedDevice
    ? (liveStates[selectedDevice.id] ?? null)
    : null;

  useEffect(() => {
    if (devices.length > 0 && !selectedDevice) setSelectedDevice(devices[0]);
  }, [devices]);

  useEffect(() => {
    if (!selectedDevice) return;
    window.htpc.input.getMappings(selectedDevice.id).then(setMappings);
    setLearningCode(null);
    setLearnedRaw(null);
  }, [selectedDevice]);

  useEffect(() => {
    if (!learningCode) return;
    const unsub = window.htpc.input.onEvent((ev: NormalizedInputEvent) => {
      if (
        ev.type === "button_press" &&
        learningRef.current &&
        ev.rawCode !== undefined
      ) {
        setLearnedRaw(ev.rawCode);
      }
    });
    return () => { unsub(); };
  }, [learningCode]);

  const saveMapping = useCallback(
    (inputCode: string, action: string, rawCode?: number | null): void => {
      if (!selectedDevice) return;
      const codeToSave =
        rawCode !== null && rawCode !== undefined ? String(rawCode) : inputCode;
      window.htpc.input.setMapping(selectedDevice.id, codeToSave, action);
      setMappings((prev) => {
        const idx = prev.findIndex((m) => m.inputCode === codeToSave);
        const entry: ButtonMapping = {
          deviceId: selectedDevice.id,
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
    [selectedDevice],
  );

  const resetMappings = async (): Promise<void> => {
    if (!selectedDevice) return;
    await window.htpc.input.resetMappings(selectedDevice.id);
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

  const hasDiagram =
    selectedDevice &&
    (selectedDevice.type === "xbox" ||
      selectedDevice.type === "ps4" ||
      selectedDevice.type === "ps5" ||
      selectedDevice.type === "ps3");

  return (
    <div className="h-full flex gap-4 p-4 overflow-hidden">
      {/* Sidebar */}
      <div className="w-60 flex-shrink-0 flex flex-col gap-3">
        <h2
          className="text-base font-semibold"
          style={{ color: "var(--color-text)" }}
        >
          Devices
        </h2>

        {devices.length === 0 ? (
          <div
            className="text-sm text-center py-8"
            style={{ color: "var(--color-text-dim)" }}
          >
            No controllers detected.
            <br />
            <span className="text-xs opacity-60">
              User must be in the <code>input</code> group.
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {devices.map((dev) => (
              <motion.button
                key={dev.id}
                className="flex gap-3 items-center p-3 rounded-[var(--radius-card)] text-left"
                style={{
                  background:
                    selectedDevice?.id === dev.id
                      ? "var(--color-surface-raised)"
                      : "var(--color-surface)",
                  border: `1px solid ${selectedDevice?.id === dev.id ? "var(--color-accent)" : "var(--color-border)"}`,
                  boxShadow:
                    selectedDevice?.id === dev.id
                      ? "var(--shadow-glow)"
                      : "none",
                }}
                onClick={() => setSelectedDevice(dev)}
                whileTap={{ scale: 0.98 }}
              >
                {CONTROLLER_ICONS[dev.type]}
                <div className="flex flex-col min-w-0">
                  <span
                    className="text-sm font-medium truncate"
                    style={{ color: "var(--color-text)" }}
                  >
                    {dev.name}
                  </span>
                  <span
                    className="text-xs capitalize"
                    style={{ color: "var(--color-text-dim)" }}
                  >
                    {dev.type}
                  </span>
                </div>
              </motion.button>
            ))}
          </div>
        )}

        {lastEvent && (
          <div
            className="mt-auto p-3 rounded-[var(--radius-card)] text-xs"
            style={{
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div
              className="font-medium mb-1"
              style={{ color: "var(--color-accent)" }}
            >
              Last Input
            </div>
            <div style={{ color: "var(--color-text-dim)" }}>
              <div>Source: {lastEvent.source}</div>
              <div>Action: {lastEvent.action ?? lastEvent.axis}</div>
              {lastEvent.rawCode !== undefined && (
                <div>Raw: {lastEvent.rawCode}</div>
              )}
              {lastEvent.value !== undefined && (
                <div>Value: {lastEvent.value}</div>
              )}
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
                <div>
                  <h2
                    className="text-lg font-semibold"
                    style={{ color: "var(--color-text)" }}
                  >
                    {selectedDevice.name}
                  </h2>
                  <p
                    className="text-sm capitalize"
                    style={{ color: "var(--color-text-dim)" }}
                  >
                    {selectedDevice.type} · {selectedDevice.buttonCount}b ·{" "}
                    {selectedDevice.axisCount}ax
                    {selectedDevice.vendorId
                      ? ` · ${selectedDevice.vendorId.toString(16).padStart(4, "0")}:${selectedDevice.productId?.toString(16).padStart(4, "0")}`
                      : ""}
                  </p>
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
                      style={{ color: "var(--color-text-dim)" }}
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
                        background: "var(--color-surface)",
                        color: "var(--color-text-dim)",
                        border: "1px solid var(--color-border)",
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
                      background: "var(--color-surface)",
                      color: "var(--color-text-dim)",
                      border: "1px solid var(--color-border)",
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
                      "color-mix(in srgb, var(--color-accent) 12%, var(--color-surface))",
                    border: "1px solid var(--color-accent)",
                  }}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <div className="flex items-center gap-2">
                    <Lock size={16} style={{ color: "var(--color-accent)" }} />
                    <span style={{ color: "var(--color-text)" }}>
                      Controller navigation is <strong>locked</strong> while
                      viewing this tab.
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs" style={{ color: "var(--color-text-dim)" }}>
                      Hold <strong>X / □</strong> for 5 seconds to unlock
                    </span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--color-surface-raised)" }}>
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: "var(--color-accent)" }}
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
                      "color-mix(in srgb, #5bba47 12%, var(--color-surface))",
                    border: "1px solid #5bba47",
                  }}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <Unlock size={16} style={{ color: "#5bba47" }} />
                  <span style={{ color: "var(--color-text)" }}>
                    Controller navigation <strong>unlocked</strong>
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* SVG diagram */}
            {hasDiagram && (
              <div
                className="rounded-[var(--radius-card)] p-4 md:p-5"
                style={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                }}
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
              </div>
            )}

            {/* Live input readout */}
            {liveState && (
              <div
                className="rounded-[var(--radius-card)] p-4 flex flex-col gap-3"
                style={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <h3
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--color-text-dim)" }}
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
                            ? "color-mix(in srgb, var(--color-accent) 25%, var(--color-surface-raised))"
                            : "var(--color-surface-raised)",
                          border: `1px solid ${pressed ? "var(--color-accent)" : "var(--color-border)"}`,
                        }}
                      >
                        <span
                          className="text-[10px] font-medium uppercase"
                          style={{ color: "var(--color-text-dim)" }}
                        >
                          {BUTTON_LABELS[code] ?? code}
                        </span>
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{
                            background: pressed
                              ? "var(--color-accent)"
                              : "var(--color-border)",
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
                      const normalized =
                        typeof value === "number"
                          ? Math.max(-1, Math.min(1, value / 32767))
                          : value;
                      const isCenter = Math.abs(normalized) < 0.05;
                      const pct = ((normalized + 1) / 2) * 100;
                      return (
                        <div key={axis} className="flex items-center gap-3">
                          <span
                            className="text-[10px] font-mono uppercase w-20 shrink-0"
                            style={{ color: "var(--color-text-dim)" }}
                          >
                            {axis}
                          </span>
                          <div className="flex-1 h-3 rounded-full relative overflow-hidden" style={{ background: "var(--color-surface-raised)" }}>
                            <div
                              className="absolute top-0 bottom-0 rounded-full transition-all"
                              style={{
                                left: "50%",
                                width: isCenter ? "2px" : `${Math.abs(pct - 50) * 2}%`,
                                background: isCenter
                                  ? "var(--color-border)"
                                  : "var(--color-accent)",
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
                                background: "var(--color-text-dim)",
                                transform: "translateX(-50%)",
                              }}
                            />
                          </div>
                          <span
                            className="text-[10px] font-mono w-10 text-right shrink-0"
                            style={{ color: "var(--color-text-dim)" }}
                          >
                            {typeof value === "number" ? value.toFixed(0) : value}
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
                      "color-mix(in srgb, var(--color-accent) 22%, var(--color-surface))",
                    border: "1px solid var(--color-accent)",
                  }}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <span style={{ color: "var(--color-accent)" }}>●</span>
                  <span style={{ color: "var(--color-text)" }}>
                    Learning{" "}
                    <strong>
                      {BUTTON_LABELS[learningCode] ?? learningCode}
                    </strong>{" "}
                    — press any button on the controller
                    {learnedRaw !== null && (
                      <span style={{ color: "var(--color-accent)" }}>
                        {" "}
                        · raw code: {learnedRaw}
                      </span>
                    )}
                  </span>
                  <motion.button
                    className="ml-auto px-2 py-0.5 rounded text-xs"
                    style={{
                      background: "var(--color-surface)",
                      color: "var(--color-text-dim)",
                      border: "1px solid var(--color-border)",
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
              style={{ color: "var(--color-text-dim)" }}
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
          </div>
        ) : (
          <div
            className="h-full flex items-center justify-center"
            style={{ color: "var(--color-text-dim)" }}
          >
            Select a controller to configure it.
          </div>
        )}
      </div>
    </div>
  );
};
