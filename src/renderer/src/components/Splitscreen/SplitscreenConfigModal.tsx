import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Play, Columns, Gamepad2 } from "lucide-react";
import { LayoutPicker } from "./LayoutPicker";
import { DeviceMapper } from "./DeviceMapper";
import { useSplitscreenStore } from "../../store/splitscreen.store";
import { useSettingsStore } from "../../store/settings.store";
import {
  SplitscreenLayoutType,
  SplitscreenConfig,
  SplitscreenDeviceMapping,
  SplitscreenAudioMapping,
  computeLayoutSlots,
  detectInstanceType,
} from "../../../../shared/splitscreen-types";
import { Game, ControllerDevice } from "../../../../shared/types";

interface SplitscreenConfigModalProps {
  game: Game;
  onClose: () => void;
}

type Step = "layout" | "devices";

export const SplitscreenConfigModal: React.FC<SplitscreenConfigModalProps> = ({ game, onClose }) => {
  const {
    detectedDisplays,
    availableLayouts,
    audioSinks,
    loadDisplays,
    loadLayouts,
    loadAudioSinks,
    startSession,
  } = useSplitscreenStore();
  const { settings, update } = useSettingsStore();

  const [step, setStep] = useState<Step>("layout");
  const [selectedLayout, setSelectedLayout] = useState<SplitscreenLayoutType | null>(
    settings?.splitscreenDefaultLayout ?? null,
  );
  const [deviceMappings, setDeviceMappings] = useState<SplitscreenDeviceMapping[]>([]);
  const [audioMappings, setAudioMappings] = useState<SplitscreenAudioMapping[]>([]);
  const [hostDeviceId, setHostDeviceId] = useState<string>("");
  const [availableDevices, setAvailableDevices] = useState<ControllerDevice[]>([]);
  const [launching, setLaunching] = useState(false);
  const [slotDisplayMapping, setSlotDisplayMapping] = useState<Record<number, string>>({});

  useEffect(() => {
    loadDisplays();
    loadLayouts();
    loadAudioSinks();
  }, [loadDisplays, loadLayouts, loadAudioSinks]);

  useEffect(() => {
    // Load connected input devices
    const loadDevices = async () => {
      try {
        const devices = await window.htpc.input.devices();
        setAvailableDevices(devices);
      } catch (err) {
        console.error("Failed to load input devices:", err);
      }
    };
    loadDevices();
  }, []);

  const slotCount = availableLayouts.find((l) => l.type === selectedLayout)?.playerCount ?? 0;

  const handleDeviceAssign = useCallback((deviceId: string, slotIndex: number) => {
    setDeviceMappings((prev) => {
      const filtered = prev.filter((m) => m.deviceId !== deviceId);
      const device = availableDevices.find((d) => d.id === deviceId);
      const deviceType = device?.type === "keyboard" ? "keyboard" : device?.type === "mouse" ? "mouse" : "controller";
      return [...filtered, { deviceId, deviceType: deviceType as any, slotIndex, isHost: false }];
    });
  }, [availableDevices]);

  const handleDeviceUnassign = useCallback((deviceId: string) => {
    setDeviceMappings((prev) => prev.filter((m) => m.deviceId !== deviceId));
  }, []);

  const handleHostSet = useCallback((deviceId: string) => {
    setHostDeviceId(deviceId);
    setDeviceMappings((prev) =>
      prev.map((m) => ({ ...m, isHost: m.deviceId === deviceId })),
    );
  }, []);

  const handleAudioAssign = useCallback((sinkId: string, slotIndex: number) => {
    setAudioMappings((prev) => {
      const filtered = prev.filter((m) => m.slotIndex !== slotIndex);
      const sink = audioSinks.find((s) => s.id === sinkId);
      return [...filtered, { sinkId, sinkLabel: sink?.label ?? sink?.name ?? "", slotIndex }];
    });
  }, [audioSinks]);

  const handleLocate = useCallback((deviceId: string) => {
    window.htpc.splitscreen.locateDevice(deviceId).catch((err) => {
      console.error("Failed to locate device:", err);
    });
  }, []);

  const handleLaunch = async () => {
    if (!selectedLayout || slotCount === 0) return;
    setLaunching(true);

    const slots = computeLayoutSlots(selectedLayout, detectedDisplays,
      Object.keys(slotDisplayMapping).length > 0 ? slotDisplayMapping : undefined,
    );
    const layout = {
      type: selectedLayout,
      slots,
      displayIds: detectedDisplays.map((d) => d.id),
    };

    const instances = Array.from({ length: slotCount }, (_, i) => ({
      slotIndex: i,
      game,
      instanceType: detectInstanceType(game),
      audioSinkId: audioMappings.find((m) => m.slotIndex === i)?.sinkId,
    }));

    const config: SplitscreenConfig = {
      layout,
      instances,
      deviceMappings,
      audioMappings,
      hostDeviceId,
      slotDisplayMapping: Object.keys(slotDisplayMapping).length > 0 ? slotDisplayMapping : undefined,
    };

    // Save default layout preference
    if (settings) {
      update({ splitscreenDefaultLayout: selectedLayout });
    }

    try {
      await startSession(config);
      onClose();
    } catch (err) {
      console.error("Failed to start splitscreen session:", err);
    } finally {
      setLaunching(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: "rgba(0, 0, 0, 0.7)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="rounded-2xl flex flex-col max-h-[90vh] w-[90vw] max-w-3xl"
          style={{
            background: "var(--surface-0)",
            border: "1px solid var(--border-default)",
          }}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between p-4 border-b"
            style={{ borderColor: "var(--border-default)" }}
          >
            <div className="flex items-center gap-2">
              <Columns size={20} style={{ color: "var(--accent)" }} />
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                Splitscreen — {game.title}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded"
              style={{ color: "var(--text-secondary)" }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 px-4 py-2">
            <div
              className="flex items-center gap-1 text-xs px-2 py-1 rounded"
              style={{
                background: step === "layout" ? "var(--accent)" : "var(--surface-1)",
                color: step === "layout" ? "var(--surface-base)" : "var(--text-secondary)",
              }}
            >
              <Columns size={12} /> 1. Layout
            </div>
            <div
              className="flex items-center gap-1 text-xs px-2 py-1 rounded"
              style={{
                background: step === "devices" ? "var(--accent)" : "var(--surface-1)",
                color: step === "devices" ? "var(--surface-base)" : "var(--text-secondary)",
              }}
            >
              <Gamepad2 size={12} /> 2. Devices
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 gpu-scroll">
            {step === "layout" && (
              <div className="flex flex-col gap-4">
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Choose a layout for your splitscreen session. Layouts are computed based on your detected displays.
                </p>
                <LayoutPicker
                  selected={selectedLayout}
                  onSelect={setSelectedLayout}
                  displays={detectedDisplays}
                  slotDisplayMapping={slotDisplayMapping}
                  onSlotDisplayMap={(slotIdx, displayId) => {
                    setSlotDisplayMapping((prev) => {
                      const next = { ...prev };
                      if (displayId) {
                        next[slotIdx] = displayId;
                      } else {
                        delete next[slotIdx];
                      }
                      return next;
                    });
                  }}
                />
              </div>
            )}

            {step === "devices" && (
              <DeviceMapper
                slotCount={slotCount}
                devices={availableDevices}
                audioSinks={audioSinks}
                deviceMappings={deviceMappings}
                audioMappings={audioMappings}
                hostDeviceId={hostDeviceId}
                onDeviceAssign={handleDeviceAssign}
                onDeviceUnassign={handleDeviceUnassign}
                onHostSet={handleHostSet}
                onAudioAssign={handleAudioAssign}
                onLocate={handleLocate}
              />
            )}
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-between p-4 border-t"
            style={{ borderColor: "var(--border-default)" }}
          >
            <button
              className="px-4 py-2 rounded-[var(--radius-card)] text-sm"
              style={{
                background: "var(--surface-1)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
              }}
              onClick={() => (step === "devices" ? setStep("layout") : onClose())}
            >
              {step === "devices" ? "Back" : "Cancel"}
            </button>

            {step === "layout" ? (
              <motion.button
                className="px-5 py-2 rounded-[var(--radius-card)] text-sm font-semibold flex items-center gap-2"
                style={{
                  background: selectedLayout ? "var(--accent)" : "var(--surface-1)",
                  color: selectedLayout ? "var(--surface-base)" : "var(--text-secondary)",
                  cursor: selectedLayout ? "pointer" : "not-allowed",
                }}
                onClick={() => selectedLayout && setStep("devices")}
                whileTap={{ scale: selectedLayout ? 0.96 : 1 }}
                disabled={!selectedLayout}
              >
                Next: Assign Devices
              </motion.button>
            ) : (
              <motion.button
                className="px-5 py-2 rounded-[var(--radius-card)] text-sm font-semibold flex items-center gap-2"
                style={{
                  background: "var(--accent)",
                  color: "var(--surface-base)",
                }}
                onClick={handleLaunch}
                whileTap={{ scale: 0.96 }}
                disabled={launching}
              >
                <Play size={14} />
                {launching ? "Launching..." : "Launch Splitscreen"}
              </motion.button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
