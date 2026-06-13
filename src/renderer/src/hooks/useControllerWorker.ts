import { useEffect, useRef, useState, useCallback } from "react";
import { useInputStore } from "../store/input.store";
import {
  ControllerDevice,
  NormalizedInputEvent,
} from "../../../shared/types";
import {
  COMPACT_EVENT_SIZE,
  writeCompactEvent,
  CompactEventKind,
} from "../../../shared/controller-buffer";

interface WorkerSlotState {
  idx: number;
  deviceId: string;
  name: string;
  type: string;
  axes: number[];
  buttons: Record<string, boolean>;
  rawButtons: Record<string, boolean>;
  lastAxisCode: number;
  lastButtonCode: number;
}

interface ControllerWorkerState {
  devices: ControllerDevice[];
  learningDeviceId: string | null;
  setLearningDeviceId: (id: string | null) => void;
}

let globalWorker: Worker | null = null;
let globalDevices: ControllerDevice[] = [];
let globalLearningDeviceId: string | null = null;
let learningListeners = new Set<(ev: NormalizedInputEvent) => void>();
let eventListeners = new Set<(ev: NormalizedInputEvent) => void>();
let deviceChangeListeners = new Set<() => void>();
let ipcListenersRegistered = false;

/* Previous state per device for transition detection */
const prevLiveStates: Record<string, { buttons: Record<string, boolean>; axes: Record<string, number> }> = {};

function getOrCreateWorker(): Worker {
  if (globalWorker) return globalWorker;

  const worker = new Worker(
    new URL("../workers/controller.worker.ts", import.meta.url),
    { type: "module" },
  );

  worker.onmessage = (e: MessageEvent) => {
    const msg = e.data;
    if (!msg) return;

    switch (msg.type) {
      case "device-connected": {
        // Prefer the full device record already in the store (added by IPC or
        // useGamepadApi) so metadata like connectionType / latency is preserved.
        const existing = useInputStore.getState().devices.find(
          (d) => d.id === msg.deviceId,
        );
        const device: ControllerDevice = existing ?? {
          id: msg.deviceId,
          name: msg.name,
          type: msg.deviceType,
          axisCount: 8,
          buttonCount: 16,
          connectionType: "unknown",
        };
        const next = [...globalDevices];
        next[msg.controllerIdx as number] = device;
        globalDevices = next;
        useInputStore.getState().addDevice(device);
        for (const cb of deviceChangeListeners) {
          try { cb(); } catch {}
        }
        break;
      }
      case "device-disconnected": {
        const next = [...globalDevices];
        delete next[msg.controllerIdx as number];
        globalDevices = next;
        useInputStore.getState().removeDevice(msg.deviceId);
        for (const cb of deviceChangeListeners) {
          try { cb(); } catch {}
        }
        break;
      }
      case "state-update": {
        handleStateUpdate(msg.slots as WorkerSlotState[]);
        break;
      }
      case "learn-event": {
        if (msg.deviceId === globalLearningDeviceId) {
          const ev: NormalizedInputEvent = {
            source: "gamepad",
            deviceId: msg.deviceId,
            deviceName: msg.deviceId,
            type: "button_press",
            action: msg.action,
            rawCode: msg.rawCode,
            timestamp: Date.now(),
          };
          for (const cb of learningListeners) {
            try { cb(ev); } catch {}
          }
        }
        break;
      }
    }
  };

  globalWorker = worker;
  return worker;
}

function handleStateUpdate(slots: WorkerSlotState[]) {
  const store = useInputStore.getState();
  const liveStates = store.liveStates;
  let changed = false;
  const nextLiveStates = { ...liveStates };

  for (const slot of slots) {
    const deviceId = slot.deviceId;
    if (!deviceId) continue;

    const existing = liveStates[deviceId];
    const buttons: Record<string, boolean> = { ...slot.buttons };
    const axes: Record<string, number> = {
      left_x: slot.axes[0] ?? 0,
      left_y: slot.axes[1] ?? 0,
      right_x: slot.axes[2] ?? 0,
      right_y: slot.axes[3] ?? 0,
      left_trigger: slot.axes[4] ?? 0,
      right_trigger: slot.axes[5] ?? 0,
      dpad_x: slot.axes[6] ?? 0,
      dpad_y: slot.axes[7] ?? 0,
    };

    const prev = prevLiveStates[deviceId];

    // Emit button press/release events
    if (prev) {
      const allActions = new Set([
        ...Object.keys(buttons),
        ...Object.keys(prev.buttons),
      ]);
      for (const action of allActions) {
        const pressed = buttons[action] ?? false;
        const wasPressed = prev.buttons[action] ?? false;
        if (pressed && !wasPressed) {
          const ev: NormalizedInputEvent = {
            source: "gamepad",
            deviceId,
            deviceName: slot.name ?? deviceId,
            type: "button_press",
            action,
            rawCode: slot.lastButtonCode,
            timestamp: Date.now(),
          };
          for (const cb of eventListeners) {
            try { cb(ev); } catch {}
          }
        } else if (!pressed && wasPressed) {
          const ev: NormalizedInputEvent = {
            source: "gamepad",
            deviceId,
            deviceName: slot.name ?? deviceId,
            type: "button_release",
            action,
            rawCode: slot.lastButtonCode,
            timestamp: Date.now(),
          };
          for (const cb of eventListeners) {
            try { cb(ev); } catch {}
          }
        }
      }

      // Emit axis events
      for (const [axis, value] of Object.entries(axes)) {
        if (value !== (prev.axes[axis] ?? 0)) {
          const ev: NormalizedInputEvent = {
            source: "gamepad",
            deviceId,
            deviceName: slot.name ?? deviceId,
            type: "axis",
            axis,
            value,
            rawCode: slot.lastAxisCode,
            timestamp: Date.now(),
          };
          for (const cb of eventListeners) {
            try { cb(ev); } catch {}
          }
        }
      }
    }

    prevLiveStates[deviceId] = { buttons: { ...buttons }, axes: { ...axes } };

    // Check if changed for store update
    const buttonsChanged =
      !existing ||
      Object.keys(buttons).length !== Object.keys(existing.buttons).length ||
      Object.entries(buttons).some(([k, v]) => existing.buttons[k] !== v);
    const axesChanged =
      !existing ||
      Object.entries(axes).some(([k, v]) => (existing.axes[k] ?? 0) !== v);

    if (buttonsChanged || axesChanged) {
      nextLiveStates[deviceId] = {
        buttons,
        axes,
        lastUpdated: Date.now(),
      };
      changed = true;
    }
  }

  if (changed) {
    useInputStore.setState({ liveStates: nextLiveStates });
  }
}

/** Forward a compact event to the worker. The buffer is transferred, not cloned. */
function postCompactEvent(
  worker: Worker,
  kind: CompactEventKind,
  controllerIdx: number,
  code: number,
  value: number,
): void {
  const buf = new ArrayBuffer(COMPACT_EVENT_SIZE);
  const view = new DataView(buf);
  writeCompactEvent(view, kind, controllerIdx, code, value, Date.now() >>> 0);
  worker.postMessage({ type: "compact-event", buffer: buf }, [buf]);
}

/** Subscribe to raw learning events (used by Controllers tab). */
export function subscribeLearning(cb: (ev: NormalizedInputEvent) => void): () => void {
  learningListeners.add(cb);
  return () => learningListeners.delete(cb);
}

/** Enable/disable learning mode for a specific device. */
export function setLearningDeviceId(id: string | null): void {
  globalLearningDeviceId = id;
  getControllerWorker()?.postMessage({ type: "set-learning", active: !!id });
}

/** Subscribe to synthesized controller events from worker state updates. */
export function subscribeControllerEvents(cb: (ev: NormalizedInputEvent) => void): () => void {
  eventListeners.add(cb);
  return () => eventListeners.delete(cb);
}

export function useControllerWorker(): ControllerWorkerState {
  const workerRef = useRef<Worker | null>(null);
  const [devices, setDevices] = useState<ControllerDevice[]>([]);
  const [learningDeviceId, setLearningDeviceIdState] = useState<string | null>(null);

  useEffect(() => {
    const worker = getOrCreateWorker();
    workerRef.current = worker;

    // Sync local React state with global state once at mount
    setDevices(globalDevices.filter(Boolean));

    // Subscribe to worker-driven device list changes
    const onDevicesChange = () => setDevices(globalDevices.filter(Boolean));
    deviceChangeListeners.add(onDevicesChange);

    // Forward IPC device connect/disconnect to worker.
    // The worker is the single source of truth; it echoes back device-connected
    // / device-disconnected which we use to update local state.
    // Guard with a flag so multiple hook instances don't register duplicate IPC listeners.
    let unsubConnect = () => {};
    let unsubDisconnect = () => {};
    let unsubEvent = () => {};
    if (!ipcListenersRegistered) {
      ipcListenersRegistered = true;
      unsubConnect = window.htpc.input.onDeviceConnected((dev) => {
        // Store the full device record immediately so metadata like
        // connectionType / latency is preserved. The worker will echo back
        // a stub message later, and the handler below will reuse this record.
        useInputStore.getState().addDevice(dev);
        worker.postMessage({
          type: "connect",
          controllerIdx: dev.controllerIdx ?? 0,
          deviceId: dev.id,
          name: dev.name,
          deviceType: dev.type,
        });
      });

      unsubDisconnect = window.htpc.input.onDeviceDisconnected((payload) => {
        worker.postMessage({
          type: "disconnect",
          controllerIdx: payload.controllerIdx,
        });
      });

      // Forward compact gamepad events to worker (transfer the buffer)
      // Electron IPC deserializes Node Buffer as Uint8Array backed by a large
      // pool ArrayBuffer. We MUST copy into an exact-size buffer so the
      // worker reads the correct 12 bytes.
      unsubEvent = window.htpc.input.onEvent((buffer) => {
        const src = new Uint8Array(buffer);
        const copy = src.slice();
        worker.postMessage({ type: "compact-event", buffer: copy.buffer }, [copy.buffer]);
      });

      // Sync already-connected devices that may have been missed before listener registration
      window.htpc.input.devices().then((existingDevices) => {
        for (const dev of existingDevices) {
          useInputStore.getState().addDevice(dev);
          worker.postMessage({
            type: "connect",
            controllerIdx: dev.controllerIdx ?? 0,
            deviceId: dev.id,
            name: dev.name,
            deviceType: dev.type,
          });
        }
      });
    }

    return () => {
      deviceChangeListeners.delete(onDevicesChange);
      unsubConnect();
      unsubDisconnect();
      unsubEvent();
      ipcListenersRegistered = false;
    };
  }, []);

  const setLearningDeviceId = useCallback((id: string | null) => {
    globalLearningDeviceId = id;
    setLearningDeviceIdState(id);
    workerRef.current?.postMessage({ type: "set-learning", active: !!id });
  }, []);

  return {
    devices,
    learningDeviceId,
    setLearningDeviceId,
  };
}

/** Get the global worker instance (for external callers like useGamepadApi). */
export function getControllerWorker(): Worker | null {
  return globalWorker;
}

/** Post a compact event directly (used by useGamepadApi fallback). */
export function postGamepadState(
  controllerIdx: number,
  axes: number[],
  buttons: Record<string, boolean>,
): void {
  const worker = getControllerWorker();
  if (!worker) return;
  worker.postMessage({ type: "gamepad-state", controllerIdx, axes, buttons });
}
