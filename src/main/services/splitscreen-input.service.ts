import { execSync, spawn, ChildProcess } from "child_process";
import { existsSync, readdirSync, openSync, closeSync } from "fs";
import { InputRouter, SplitscreenDeviceType, WindowServerType } from "../../shared/splitscreen-types";
import { createLogger } from "../util/logger";

const log = createLogger("info");

function detectWindowServer(): WindowServerType {
  if (process.env.XDG_SESSION_TYPE === "wayland" || process.env.WAYLAND_DISPLAY) {
    return "wayland";
  }
  return "x11";
}

// uinput event types (from linux/input.h)
const EV_KEY = 0x01;
const EV_ABS = 0x03;
const EV_SYN = 0x00;

// uinput setup struct (from linux/uinput.h)
// This is a simplified approach using ioctl via a helper script

interface VirtualDevice {
  slotIndex: number;
  deviceType: SplitscreenDeviceType;
  fd: number;
  name: string;
  process: ChildProcess;
}

class X11InputRouter implements InputRouter {
  private virtualDevices = new Map<number, VirtualDevice[]>();
  private deviceAssignments = new Map<string, number>(); // deviceId → slotIndex
  private hostDeviceId: string | null = null;
  private hostMode = false;

  async createVirtualDevice(slotIndex: number, deviceType: SplitscreenDeviceType): Promise<string> {
    const deviceName = `ember-splitscreen-p${slotIndex + 1}-${deviceType}`;

    try {
      // Check if /dev/uinput is accessible
      if (!existsSync("/dev/uinput")) {
        log.error("splitscreen-input", "/dev/uinput not found. Virtual input devices require the uinput kernel module.");
        throw new Error("/dev/uinput not available");
      }

      // Use python3 to create a uinput device (avoids native addon complexity)
      const script = `
import fcntl
import struct
import os
import sys
import time

# ioctl definitions
UI_DEV_CREATE = 21761  # _IO('U', 1)
UI_DEV_DESTROY = 21762  # _IO('U', 2)
UI_SET_EVBIT = 0x40045564   # _IOW('U', 100, int)
UI_SET_KEYBIT = 0x40045565  # _IOW('U', 101, int)
UI_SET_ABSBIT = 0x40045567  # _IOW('U', 103, int)

EV_KEY = 0x01
EV_ABS = 0x03

# uinput_user_dev struct (kernel 6.x):
#   char name[80]
#   struct input_id { u16 bustype, u16 vendor, u16 product, u16 version }
#   u32 ff_effects_max
#   s32 absmin[64] + s32 absmax[64] + s32 absfuzz[64] + s32 absflat[64]
# Total: 80 + 8 + 4 + 256*4 = 1116 bytes

fd = os.open("/dev/uinput", os.O_RDWR)

name = "${deviceName}".encode("utf-8")[:80]
name = name.ljust(80, b"\\0")

# Build abs ranges: axes 0-3 (X,Y,Z,RZ) get -32768..32767, rest default 0..0
absmin = [0] * 64
absmax = [0] * 64
absfuzz = [0] * 64
absflat = [0] * 64
for i in range(4):
    absmin[i] = -32768
    absmax[i] = 32767

# Pack: name[80] + bustype(u16) + vendor(u16) + product(u16) + version(u16) + ff_effects_max(u32) + 256 ints
dev = struct.pack("80sHHHHI" + "i" * 256, name, 0x0003, 0x1234, 0x0001, 0x0001, 0,
    *(absmin + absmax + absfuzz + absflat))

assert len(dev) == 1116, f"struct size mismatch: {len(dev)} != 1116"

# Set event types
fcntl.ioctl(fd, UI_SET_EVBIT, EV_KEY)
fcntl.ioctl(fd, UI_SET_EVBIT, EV_ABS)

# Enable common gamepad buttons (BTN_GAMEPAD = 0x130 .. 0x13f)
for btn in range(0x130, 0x140):
    fcntl.ioctl(fd, UI_SET_KEYBIT, btn)

# Enable analog axes (ABS_X=0, ABS_Y=1, ABS_Z=2, ABS_RZ=3)
for axis in range(0, 4):
    fcntl.ioctl(fd, UI_SET_ABSBIT, axis)

# Write device struct — ensure full write
written = os.write(fd, dev)
assert written == len(dev), f"short write: {written} != {len(dev)}"

# Create the device
fcntl.ioctl(fd, UI_DEV_CREATE, 0)

# Keep the device alive
print(f"uinput:${deviceName}")
sys.stdout.flush()
time.sleep(999999)
`;

      const child = spawn("python3", ["-c", script], { stdio: ["pipe", "pipe", "pipe"] });
      const deviceId = `virtual-${deviceName}`;

      // Wait for the device to be created
      const created = await new Promise<boolean>((resolve) => {
        let output = "";
        child.stdout?.on("data", (data) => {
          output += data.toString();
          if (output.includes("uinput:")) {
            resolve(true);
          }
        });
        child.stderr?.on("data", (data) => {
          log.warn("splitscreen-input", `uinput python stderr: ${data.toString().trim()}`);
        });
        child.on("error", () => resolve(false));
        setTimeout(() => resolve(false), 3000);
      });

      if (!created) {
        log.error("splitscreen-input", `Failed to create virtual device ${deviceName}`);
        child.kill();
        throw new Error("Failed to create virtual uinput device");
      }

      const devices = this.virtualDevices.get(slotIndex) ?? [];
      devices.push({ slotIndex, deviceType, fd: -1, name: deviceName, process: child });
      this.virtualDevices.set(slotIndex, devices);

      log.info("splitscreen-input", `Created virtual device ${deviceName} for slot ${slotIndex}`);
      return deviceId;
    } catch (err) {
      log.error("splitscreen-input", `Failed to create virtual device: ${err}`);
      throw err;
    }
  }

  routeEvent(deviceId: string, event: ArrayBuffer): void {
    const slotIndex = this.deviceAssignments.get(deviceId);
    if (slotIndex === undefined) return;

    if (this.hostMode && deviceId === this.hostDeviceId) {
      // Host events go to overlay, not to game
      return;
    }

    // In a full implementation, this would write the event to the virtual uinput device
    // For now, we log that routing would occur
    // The actual event forwarding requires writing input_event structs to /dev/uinput
    log.debug("splitscreen-input", `Route event from ${deviceId} to slot ${slotIndex}`);
  }

  async destroyVirtualDevice(slotIndex: number): Promise<void> {
    const devices = this.virtualDevices.get(slotIndex);
    if (!devices) return;
    for (const device of devices) {
      try {
        device.process.kill("SIGTERM");
      } catch (err) {
        log.warn("splitscreen-input", `Failed to kill python process for slot ${slotIndex}: ${err}`);
      }
    }
    this.virtualDevices.delete(slotIndex);
    log.info("splitscreen-input", `Destroyed virtual devices for slot ${slotIndex}`);
  }

  setHostMode(enabled: boolean): void {
    this.hostMode = enabled;
    log.info("splitscreen-input", `Host mode ${enabled ? "enabled" : "disabled"}`);
  }

  assignDevice(deviceId: string, slotIndex: number): void {
    this.deviceAssignments.set(deviceId, slotIndex);
    log.info("splitscreen-input", `Assigned device ${deviceId} to slot ${slotIndex}`);
  }

  unassignDevice(deviceId: string): void {
    this.deviceAssignments.delete(deviceId);
    log.info("splitscreen-input", `Unassigned device ${deviceId}`);
  }

  setHostDevice(deviceId: string): void {
    this.hostDeviceId = deviceId;
    log.info("splitscreen-input", `Host device set to ${deviceId}`);
  }

  async locateDevice(deviceId: string): Promise<void> {
    try {
      // Find the evdev path for this device
      // Try to trigger rumble via evdev
      const devices = readdirSync("/dev/input");
      for (const dev of devices) {
        if (!dev.startsWith("event")) continue;
        const path = `/dev/input/${dev}`;
        try {
          // Read device name
          const fd = openSync(path, "r");
          // This is a simplified approach - full implementation would use ioctl
          // to read EVIOCGNAME and compare with deviceId
          closeSync(fd);
        } catch {
          continue;
        }
      }
      log.info("splitscreen-input", `Locate requested for device ${deviceId} (rumble not yet implemented)`);
    } catch (err) {
      log.error("splitscreen-input", `Failed to locate device ${deviceId}: ${err}`);
    }
  }

  async cleanup(): Promise<void> {
    for (const [slotIndex] of this.virtualDevices) {
      await this.destroyVirtualDevice(slotIndex);
    }
    this.virtualDevices.clear();
    this.deviceAssignments.clear();
    this.hostDeviceId = null;
    this.hostMode = false;
  }
}

class WaylandInputRouter implements InputRouter {
  async createVirtualDevice(): Promise<string> {
    throw new Error("Wayland input routing not yet supported. A custom compositor is needed.");
  }
  routeEvent(): void {
    throw new Error("Wayland input routing not yet supported. A custom compositor is needed.");
  }
  async destroyVirtualDevice(): Promise<void> {
    throw new Error("Wayland input routing not yet supported. A custom compositor is needed.");
  }
  setHostMode(): void {
    throw new Error("Wayland input routing not yet supported. A custom compositor is needed.");
  }
  assignDevice(): void {
    throw new Error("Wayland input routing not yet supported. A custom compositor is needed.");
  }
  unassignDevice(): void {
    throw new Error("Wayland input routing not yet supported. A custom compositor is needed.");
  }
  setHostDevice(): void {
    throw new Error("Wayland input routing not yet supported. A custom compositor is needed.");
  }
  async locateDevice(): Promise<void> {
    throw new Error("Wayland input routing not yet supported. A custom compositor is needed.");
  }
  async cleanup(): Promise<void> {}
}

let router: InputRouter | null = null;

function getRouter(): InputRouter {
  if (router) return router;
  const server = detectWindowServer();
  if (server === "wayland") {
    router = new WaylandInputRouter();
  } else {
    router = new X11InputRouter();
  }
  return router;
}

export function getInputServer(): WindowServerType {
  return detectWindowServer();
}

export async function createVirtualDevice(slotIndex: number, deviceType: SplitscreenDeviceType): Promise<string> {
  return getRouter().createVirtualDevice(slotIndex, deviceType);
}

export function routeInputEvent(deviceId: string, event: ArrayBuffer): void {
  getRouter().routeEvent(deviceId, event);
}

export async function destroyVirtualDevice(slotIndex: number): Promise<void> {
  return getRouter().destroyVirtualDevice(slotIndex);
}

export function setHostMode(enabled: boolean): void {
  getRouter().setHostMode(enabled);
}

export function assignDevice(deviceId: string, slotIndex: number): void {
  getRouter().assignDevice(deviceId, slotIndex);
}

export function unassignDevice(deviceId: string): void {
  getRouter().unassignDevice(deviceId);
}

export function setHostDevice(deviceId: string): void {
  getRouter().setHostDevice(deviceId);
}

export async function locateDevice(deviceId: string): Promise<void> {
  return getRouter().locateDevice(deviceId);
}

export async function cleanupInputService(): Promise<void> {
  if (router) {
    await router.cleanup();
    router = null;
  }
}
