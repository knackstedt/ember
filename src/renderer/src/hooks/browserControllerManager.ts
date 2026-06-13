import { CursorStyle } from "../components/VirtualCursor/VirtualCursor";

export interface DeviceCursor {
  deviceId: string;
  posRef: { current: { x: number; y: number } };
  hue: number;
  visible: boolean;
  hoverStyle: CursorStyle;
  expanded: boolean;
  /** Click flash intensity (0..1), mutated by controller nav and read by rAF loop */
  clickRef: { current: number };
}

export interface CursorManager {
  cursors: DeviceCursor[];
  listeners: Set<() => void>;
  subscribe(fn: () => void): () => void;
  notify(): void;
  setCursors(next: DeviceCursor[]): void;
  lastPositions: Map<string, { x: number; y: number; lastInputTime: number }>;
}

const manager: CursorManager = {
  cursors: [],
  listeners: new Set(),
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },
  notify() {
    this.listeners.forEach((fn) => fn());
  },
  setCursors(next) {
    this.cursors = next;
    this.notify();
  },
  lastPositions: new Map(),
};

export function getCursorManager(): CursorManager {
  return manager;
}
