import React, { useState } from "react";
import { motion } from "framer-motion";
import { Volume2, Search } from "lucide-react";
import { ControllerGhost } from "./ControllerGhost";
import {
  SplitscreenDeviceMapping,
  SplitscreenAudioMapping,
  AudioSink,
  SplitscreenDeviceType,
} from "../../../../shared/splitscreen-types";
import { ControllerDevice } from "../../../../shared/types";

interface DeviceMapperProps {
  slotCount: number;
  devices: ControllerDevice[];
  audioSinks: AudioSink[];
  deviceMappings: SplitscreenDeviceMapping[];
  audioMappings: SplitscreenAudioMapping[];
  hostDeviceId: string;
  onDeviceAssign: (deviceId: string, slotIndex: number) => void;
  onDeviceUnassign: (deviceId: string) => void;
  onHostSet: (deviceId: string) => void;
  onAudioAssign: (sinkId: string, slotIndex: number) => void;
  onLocate: (deviceId: string) => void;
}

function detectDeviceType(device: ControllerDevice): SplitscreenDeviceType {
  if (device.type === "keyboard") return "keyboard";
  if (device.type === "mouse") return "mouse";
  return "controller";
}

export const DeviceMapper: React.FC<DeviceMapperProps> = ({
  slotCount,
  devices,
  audioSinks,
  deviceMappings,
  audioMappings,
  hostDeviceId,
  onDeviceAssign,
  onDeviceUnassign,
  onHostSet,
  onAudioAssign,
  onLocate,
}) => {
  const [locateActiveId, setLocateActiveId] = useState<string | null>(null);

  const handleLocate = (deviceId: string) => {
    setLocateActiveId(deviceId);
    onLocate(deviceId);
    setTimeout(() => setLocateActiveId(null), 2000);
  };

  const getSlotDevices = (slotIndex: number) => {
    return deviceMappings.filter((m) => m.slotIndex === slotIndex);
  };

  const getSlotAudio = (slotIndex: number) => {
    return audioMappings.find((m) => m.slotIndex === slotIndex);
  };

  const getDeviceMapping = (deviceId: string) => {
    return deviceMappings.find((m) => m.deviceId === deviceId);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 mb-2">
        <Search size={16} style={{ color: "var(--accent)" }} />
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Assign devices to player slots
        </h3>
      </div>

      <div className="flex flex-col gap-3">
        {Array.from({ length: slotCount }, (_, i) => i).map((slotIndex) => {
          const slotDevices = getSlotDevices(slotIndex);
          const slotAudio = getSlotAudio(slotIndex);
          const hasHost = slotDevices.some((d) => d.isHost);

          return (
            <div
              key={slotIndex}
              className="p-4 rounded-[var(--radius-card)]"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className="text-sm font-bold"
                    style={{ color: "var(--accent)" }}
                  >
                    Player {slotIndex + 1}
                  </span>
                  {hasHost && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: "var(--accent)",
                        color: "var(--surface-base)",
                      }}
                    >
                      Host
                    </span>
                  )}
                </div>
              </div>

              {/* Assigned devices */}
              <div className="flex flex-wrap gap-3 mb-3">
                {slotDevices.length === 0 && (
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    No devices assigned
                  </span>
                )}
                {slotDevices.map((mapping) => {
                  const device = devices.find((d) => d.id === mapping.deviceId);
                  if (!device) return null;
                  return (
                    <div key={mapping.deviceId} className="flex items-center gap-2">
                      <ControllerGhost
                        type={({
                          keyboard: "keyboard",
                          mouse: "mouse",
                          controller: "gamepad",
                        } as const)[detectDeviceType(device)]}
                        playerNumber={slotIndex + 1}
                        label={device.name}
                        locateActive={locateActiveId === mapping.deviceId}
                        size={32}
                      />
                      <div className="flex flex-col gap-1">
                        <button
                          className="text-xs px-2 py-0.5 rounded"
                          style={{
                            background: "var(--surface-0)",
                            color: "var(--text-secondary)",
                            border: "1px solid var(--border-default)",
                          }}
                          onClick={() => onDeviceUnassign(mapping.deviceId)}
                        >
                          Unassign
                        </button>
                        <button
                          className="text-xs px-2 py-0.5 rounded"
                          style={{
                            background: "var(--surface-0)",
                            color: "var(--text-secondary)",
                            border: "1px solid var(--border-default)",
                          }}
                          onClick={() => handleLocate(mapping.deviceId)}
                        >
                          Locate
                        </button>
                        {hostDeviceId !== mapping.deviceId && (
                          <button
                            className="text-xs px-2 py-0.5 rounded"
                            style={{
                              background: "var(--surface-0)",
                              color: "var(--text-secondary)",
                              border: "1px solid var(--border-default)",
                            }}
                            onClick={() => onHostSet(mapping.deviceId)}
                          >
                            Set Host
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Audio sink selector */}
              <div className="flex items-center gap-2 mb-3">
                <Volume2 size={14} style={{ color: "var(--text-secondary)" }} />
                <select
                  className="text-xs px-2 py-1 rounded flex-1"
                  style={{
                    background: "var(--surface-0)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-default)",
                  }}
                  value={slotAudio?.sinkId ?? ""}
                  onChange={(e) => {
                    if (e.target.value) {
                      onAudioAssign(e.target.value, slotIndex);
                    }
                  }}
                >
                  <option value="">Default audio output</option>
                  {audioSinks.map((sink) => (
                    <option key={sink.id} value={sink.id}>
                      {sink.label ?? sink.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Unassigned devices to assign */}
              <div className="flex flex-wrap gap-2">
                {devices
                  .filter((d) => {
                    const mapping = getDeviceMapping(d.id);
                    return !mapping || mapping.slotIndex !== slotIndex;
                  })
                  .map((device) => (
                    <motion.button
                      key={device.id}
                      className="text-xs px-2 py-1 rounded flex items-center gap-1"
                      style={{
                        background: "var(--surface-0)",
                        color: "var(--text-secondary)",
                        border: "1px solid var(--border-default)",
                      }}
                      onClick={() => onDeviceAssign(device.id, slotIndex)}
                      whileTap={{ scale: 0.96 }}
                    >
                      + {device.name}
                    </motion.button>
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
