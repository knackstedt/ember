/**
 * Bluetooth service — wraps `bluetoothctl` to scan, pair, trust, connect,
 * and disconnect Bluetooth devices (primarily game controllers).
 *
 * Uses the `bluetoothctl` command-line tool which is standard on Linux
 * with BlueZ. All commands run via `execSync` / `spawn` for simplicity.
 */
import { execSync, spawn } from "child_process";
import { BluetoothDevice, BluetoothAdapterState } from "../../shared/types";
import { createLogger } from "../util/logger";

const log = createLogger("info");

/** Check whether bluetoothctl is available on this system. */
export function isBluetoothAvailable(): boolean {
  try {
    execSync("which bluetoothctl", { stdio: "pipe", timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

/** Get the adapter state (power, discovery, address, name). */
export function getAdapterState(): BluetoothAdapterState {
  const defaults: BluetoothAdapterState = {
    powered: false,
    discovering: false,
    address: "",
    name: "",
  };
  if (!isBluetoothAvailable()) return defaults;
  try {
    const output = execSync("bluetoothctl show", {
      encoding: "utf-8",
      timeout: 5000,
    });
    const powered = /Powered:\s*yes/i.test(output);
    const discovering = /Discovering:\s*yes/i.test(output);
    const addressMatch = output.match(/Controller:\s*([0-9A-Fa-f:]{17})/);
    const nameMatch = output.match(/Name:\s*(.+)/);
    return {
      powered,
      discovering,
      address: addressMatch?.[1]?.trim() ?? "",
      name: nameMatch?.[1]?.trim() ?? "",
    };
  } catch (err) {
    log.warn("bluetooth", `getAdapterState failed: ${err}`);
    return defaults;
  }
}

/** Power the adapter on or off. */
export function setAdapterPower(on: boolean): boolean {
  try {
    execSync(`bluetoothctl power ${on ? "on" : "off"}`, {
      stdio: "pipe",
      timeout: 5000,
    });
    return true;
  } catch (err) {
    log.warn("bluetooth", `setAdapterPower(${on}) failed: ${err}`);
    return false;
  }
}

/** Parse `bluetoothctl devices` output into BluetoothDevice objects. */
function parseDevicesOutput(output: string): BluetoothDevice[] {
  const devices: BluetoothDevice[] = [];
  const lines = output.split("\n");
  for (const line of lines) {
    const match = line.match(/^Device\s+([0-9A-Fa-f:]{17})\s+(.+)$/);
    if (!match) continue;
    const mac = match[1];
    const name = match[2].trim();
    devices.push({
      mac,
      name,
      paired: false,
      trusted: false,
      connected: false,
    });
  }
  return devices;
}

/** Enrich device list with paired/trusted/connected status from `info` output. */
function enrichDeviceInfo(devices: BluetoothDevice[]): BluetoothDevice[] {
  return devices.map((dev) => {
    try {
      const info = execSync(`bluetoothctl info ${dev.mac}`, {
        encoding: "utf-8",
        timeout: 5000,
      });
      const paired = /Paired:\s*yes/i.test(info);
      const trusted = /Trusted:\s*yes/i.test(info);
      const connected = /Connected:\s*yes/i.test(info);
      const iconMatch = info.match(/Icon:\s*(\S+)/);
      const rssiMatch = info.match(/RSSI:\s*(-?\d+)/);
      const batteryMatch = info.match(/Battery Percentage:\s*(\d+)/);

      let rssiPercent: number | undefined;
      if (rssiMatch) {
        const rssi = parseInt(rssiMatch[1], 10);
        // RSSI ranges roughly -100 (far) to 0 (very close)
        rssiPercent = Math.max(0, Math.min(100, Math.round((rssi + 100) / 100 * 100)));
      }

      return {
        ...dev,
        paired,
        trusted,
        connected,
        icon: iconMatch?.[1],
        rssiPercent,
        batteryPercent: batteryMatch ? parseInt(batteryMatch[1], 10) : undefined,
      };
    } catch {
      return dev;
    }
  });
}

/** List all known Bluetooth devices (paired or previously seen). */
export function listDevices(): BluetoothDevice[] {
  if (!isBluetoothAvailable()) return [];
  try {
    const output = execSync("bluetoothctl devices", {
      encoding: "utf-8",
      timeout: 5000,
    });
    const devices = parseDevicesOutput(output);
    return enrichDeviceInfo(devices);
  } catch (err) {
    log.warn("bluetooth", `listDevices failed: ${err}`);
    return [];
  }
}

/** Start a discovery scan for `durationSeconds` and return found devices. */
export function scanDevices(durationSeconds: number = 10): BluetoothDevice[] {
  if (!isBluetoothAvailable()) return [];
  try {
    // Run scanon for the specified duration then scanoff
    execSync(`bluetoothctl scan on`, {
      stdio: "pipe",
      timeout: durationSeconds * 1000 + 2000,
    });
    // Wait for the scan duration
    execSync(`sleep ${durationSeconds}`, {
      stdio: "pipe",
      timeout: durationSeconds * 1000 + 2000,
    });
    execSync(`bluetoothctl scan off`, {
      stdio: "pipe",
      timeout: 5000,
    });
    return listDevices();
  } catch (err) {
    log.warn("bluetooth", `scanDevices failed: ${err}`);
    // Still return whatever devices are known
    return listDevices();
  }
}

/** Pair a device by MAC address. */
export function pairDevice(mac: string): boolean {
  try {
    execSync(`bluetoothctl pair ${mac}`, {
      stdio: "pipe",
      timeout: 30000,
    });
    // Auto-trust after pairing so it reconnects automatically
    execSync(`bluetoothctl trust ${mac}`, {
      stdio: "pipe",
      timeout: 5000,
    });
    log.info("bluetooth", `Paired and trusted ${mac}`);
    return true;
  } catch (err) {
    log.warn("bluetooth", `pairDevice(${mac}) failed: ${err}`);
    return false;
  }
}

/** Connect a paired device by MAC address. */
export function connectDevice(mac: string): boolean {
  try {
    execSync(`bluetoothctl connect ${mac}`, {
      stdio: "pipe",
      timeout: 15000,
    });
    log.info("bluetooth", `Connected ${mac}`);
    return true;
  } catch (err) {
    log.warn("bluetooth", `connectDevice(${mac}) failed: ${err}`);
    return false;
  }
}

/** Disconnect a device by MAC address. */
export function disconnectDevice(mac: string): boolean {
  try {
    execSync(`bluetoothctl disconnect ${mac}`, {
      stdio: "pipe",
      timeout: 10000,
    });
    log.info("bluetooth", `Disconnected ${mac}`);
    return true;
  } catch (err) {
    log.warn("bluetooth", `disconnectDevice(${mac}) failed: ${err}`);
    return false;
  }
}

/** Remove/unpair a device by MAC address. */
export function removeDevice(mac: string): boolean {
  try {
    execSync(`bluetoothctl remove ${mac}`, {
      stdio: "pipe",
      timeout: 10000,
    });
    log.info("bluetooth", `Removed ${mac}`);
    return true;
  } catch (err) {
    log.warn("bluetooth", `removeDevice(${mac}) failed: ${err}`);
    return false;
  }
}

/** Trust a device by MAC address. */
export function trustDevice(mac: string): boolean {
  try {
    execSync(`bluetoothctl trust ${mac}`, {
      stdio: "pipe",
      timeout: 5000,
    });
    return true;
  } catch (err) {
    log.warn("bluetooth", `trustDevice(${mac}) failed: ${err}`);
    return false;
  }
}

/** Reconnect a device: disconnect then connect again. */
export function reconnectDevice(mac: string): boolean {
  disconnectDevice(mac);
  // Brief delay to let the stack settle
  try {
    execSync("sleep 1", { stdio: "pipe", timeout: 3000 });
  } catch { /* ignore */ }
  return connectDevice(mac);
}
