import { execFileSync, execSync } from "child_process";
import { AudioSink, AudioServerType, AudioRouter } from "../../shared/splitscreen-types";
import { createLogger } from "../util/logger";
import { getSettings, setSettings } from "./settings.service";

const log = createLogger("info");

let detectedServer: AudioServerType | null = null;

function detectAudioServer(): AudioServerType | null {
  if (detectedServer) return detectedServer;
  try {
    execSync("pgrep -x pipewire", { stdio: "pipe" });
    detectedServer = "pipewire";
    log.info("splitscreen-audio", "Detected PipeWire audio server");
    return detectedServer;
  } catch {
    // pipewire not running
  }
  try {
    execSync("pgrep -x pulseaudio", { stdio: "pipe" });
    detectedServer = "pulseaudio";
    log.info("splitscreen-audio", "Detected PulseAudio audio server");
    return detectedServer;
  } catch {
    // pulseaudio not running
  }
  log.warn("splitscreen-audio", "No audio server detected (neither PipeWire nor PulseAudio)");
  return null;
}

class PulseAudioRouter implements AudioRouter {
  async listSinks(): Promise<AudioSink[]> {
    try {
      const output = execSync("pactl list short sinks", { encoding: "utf-8", stdio: "pipe" });
      const settings = await getSettings();
      const labels = settings.audioSinkLabels ?? {};
      const sinks: AudioSink[] = [];
      const defaultSink = execSync("pactl get-default-sink", { encoding: "utf-8", stdio: "pipe" }).trim();

      for (const line of output.trim().split("\n")) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 2) continue;
        const id = parts[0];
        const name = parts[1];
        const state = parts[3] ?? "";
        if (state === "SUSPENDED") continue;
        sinks.push({
          id: name,
          name,
          label: labels[name] ?? undefined,
          isDefault: name === defaultSink,
          server: "pulseaudio",
        });
      }
      return sinks;
    } catch (err) {
      log.error("splitscreen-audio", `Failed to list PulseAudio sinks: ${err}`);
      return [];
    }
  }

  async routeStream(pid: number, sinkId: string): Promise<void> {
    try {
      const sinkInputs = execSync("pactl list short sink-inputs", { encoding: "utf-8", stdio: "pipe" });
      for (const line of sinkInputs.trim().split("\n")) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 2) continue;
        const inputId = parts[0];

        const details = execFileSync("pactl", ["list", "sink-inputs", inputId], { encoding: "utf-8", stdio: "pipe" });
        const pidMatch = details.match(/application\.process\.id\s*=\s*"(\d+)"/);
        if (pidMatch && parseInt(pidMatch[1], 10) === pid) {
          execFileSync("pactl", ["move-sink-input", inputId, sinkId], { stdio: "pipe" });
          log.info("splitscreen-audio", `Routed sink-input ${inputId} (pid ${pid}) to sink ${sinkId}`);
          return;
        }
      }
      log.warn("splitscreen-audio", `No sink-input found for pid ${pid}`);
    } catch (err) {
      log.error("splitscreen-audio", `Failed to route stream for pid ${pid}: ${err}`);
    }
  }

  async unrouteStream(pid: number): Promise<void> {
    // Moving to default sink is the closest to "unroute"
    try {
      const defaultSink = execSync("pactl get-default-sink", { encoding: "utf-8", stdio: "pipe" }).trim();
      await this.routeStream(pid, defaultSink);
    } catch (err) {
      log.error("splitscreen-audio", `Failed to unroute stream for pid ${pid}: ${err}`);
    }
  }

  async setSinkLabel(sinkId: string, label: string): Promise<void> {
    const settings = await getSettings();
    const labels = { ...(settings.audioSinkLabels ?? {}) };
    if (label) {
      labels[sinkId] = label;
    } else {
      delete labels[sinkId];
    }
    await setSettings({ audioSinkLabels: labels });
  }

  async cleanup(): Promise<void> {}
}

class PipeWireRouter implements AudioRouter {
  async listSinks(): Promise<AudioSink[]> {
    try {
      const output = execSync("pw-cli list-objects PipeWire:Interface:Node", { encoding: "utf-8", stdio: "pipe" });
      const settings = await getSettings();
      const labels = settings.audioSinkLabels ?? {};
      const sinks: AudioSink[] = [];
      const defaultMatch = output.match(/default.*?node\.name\s*=\s*"([^"]+)"/i);

      for (const block of output.split(/(?=^\s*id\s+\d+)/m)) {
        const nameMatch = block.match(/node\.name\s*=\s*"([^"]+)"/);
        const mediaClassMatch = block.match(/media\.class\s*=\s*"([^"]+)"/);
        if (!nameMatch || !mediaClassMatch) continue;
        if (!mediaClassMatch[1].includes("Audio/Sink")) continue;
        const name = nameMatch[1];
        sinks.push({
          id: name,
          name,
          label: labels[name] ?? undefined,
          isDefault: defaultMatch?.[1] === name,
          server: "pipewire",
        });
      }
      return sinks;
    } catch (err) {
      log.error("splitscreen-audio", `Failed to list PipeWire sinks: ${err}`);
      return [];
    }
  }

  async routeStream(pid: number, sinkId: string): Promise<void> {
    try {
      // Use pw-loopback to create a link from the process's stream to the target sink
      // First, find the stream node for this PID
      const output = execSync("pw-cli list-objects PipeWire:Interface:Node", { encoding: "utf-8", stdio: "pipe" });
      let streamNodeId: string | null = null;

      for (const block of output.split(/(?=^\s*id\s+\d+)/m)) {
        const pidMatch = block.match(/application\.process\.id\s*=\s*"(\d+)"/);
        const mediaClassMatch = block.match(/media\.class\s*=\s*"([^"]+)"/);
        if (pidMatch && parseInt(pidMatch[1], 10) === pid && mediaClassMatch?.[1].includes("Audio/Sink")) {
          const idMatch = block.match(/^\s*id\s+(\d+)/m);
          if (idMatch) {
            streamNodeId = idMatch[1];
            break;
          }
        }
      }

      if (!streamNodeId) {
        log.warn("splitscreen-audio", `No PipeWire stream node found for pid ${pid}`);
        return;
      }

      // Find target sink node ID
      let sinkNodeId: string | null = null;
      for (const block of output.split(/(?=^\s*id\s+\d+)/m)) {
        const nameMatch = block.match(/node\.name\s*=\s*"([^"]+)"/);
        const mediaClassMatch = block.match(/media\.class\s*=\s*"([^"]+)"/);
        if (nameMatch?.[1] === sinkId && mediaClassMatch?.[1].includes("Audio/Sink")) {
          const idMatch = block.match(/^\s*id\s+(\d+)/m);
          if (idMatch) {
            sinkNodeId = idMatch[1];
            break;
          }
        }
      }

      if (!sinkNodeId) {
        log.warn("splitscreen-audio", `Target sink ${sinkId} not found in PipeWire`);
        return;
      }

      // Find the output port of the stream node and an input port of the sink node.
      const portsOutput = execSync("pw-cli list-objects PipeWire:Interface:Port", { encoding: "utf-8", stdio: "pipe" });
      let sourcePort: string | null = null;
      let targetPort: string | null = null;
      for (const block of portsOutput.split(/(?=^\s*id\s+\d+)/m)) {
        const nodeIdMatch = block.match(/node\.id\s*=\s*"(\d+)"/);
        const directionMatch = block.match(/port\.direction\s*=\s*"([^"]+)"/);
        const nameMatch = block.match(/port\.name\s*=\s*"([^"]+)"/);
        if (!nodeIdMatch || !directionMatch || !nameMatch) continue;
        const nodeId = nodeIdMatch[1];
        const direction = directionMatch[1];
        const portName = nameMatch[1];
        if (nodeId === streamNodeId && direction === "out") {
          sourcePort = portName;
        } else if (nodeId === sinkNodeId && direction === "in") {
          targetPort = portName;
        }
        if (sourcePort && targetPort) break;
      }

      if (!sourcePort || !targetPort) {
        log.warn("splitscreen-audio", `Could not find ports to route pid ${pid} to sink ${sinkId}`);
        return;
      }

      // Create a link between the ports using pw-link.
      execFileSync("pw-link", [sourcePort, targetPort], { stdio: "pipe" });
      log.info("splitscreen-audio", `Routed pid ${pid} (port ${sourcePort}) to sink ${sinkId} (port ${targetPort})`);
    } catch (err) {
      log.error("splitscreen-audio", `Failed to route PipeWire stream for pid ${pid}: ${err}`);
    }
  }

  async unrouteStream(pid: number): Promise<void> {
    // PipeWire links are automatically cleaned up when the stream ends
    log.info("splitscreen-audio", `Unroute requested for pid ${pid} (PipeWire auto-cleans links)`);
  }

  async setSinkLabel(sinkId: string, label: string): Promise<void> {
    const settings = await getSettings();
    const labels = { ...(settings.audioSinkLabels ?? {}) };
    if (label) {
      labels[sinkId] = label;
    } else {
      delete labels[sinkId];
    }
    await setSettings({ audioSinkLabels: labels });
  }

  async cleanup(): Promise<void> {}
}

let router: AudioRouter | null = null;

function getRouter(): AudioRouter | null {
  if (router) return router;
  const server = detectAudioServer();
  if (!server) return null;
  if (server === "pipewire") {
    router = new PipeWireRouter();
  } else {
    router = new PulseAudioRouter();
  }
  return router;
}

export async function listAudioSinks(): Promise<AudioSink[]> {
  const r = getRouter();
  if (!r) return [];
  return r.listSinks();
}

export async function routeAudioStream(pid: number, sinkId: string): Promise<void> {
  const r = getRouter();
  if (!r) return;
  await r.routeStream(pid, sinkId);
}

export async function unrouteAudioStream(pid: number): Promise<void> {
  const r = getRouter();
  if (!r) return;
  await r.unrouteStream(pid);
}

export async function setAudioSinkLabel(sinkId: string, label: string): Promise<void> {
  const r = getRouter();
  if (!r) {
    // Still save the label even if no server detected
    const settings = await getSettings();
    const labels = { ...(settings.audioSinkLabels ?? {}) };
    if (label) labels[sinkId] = label;
    else delete labels[sinkId];
    await setSettings({ audioSinkLabels: labels });
    return;
  }
  await r.setSinkLabel(sinkId, label);
}

export function getAudioServer(): AudioServerType | null {
  return detectAudioServer();
}

export async function cleanupAudioService(): Promise<void> {
  if (router) {
    await router.cleanup();
    router = null;
  }
  detectedServer = null;
}
