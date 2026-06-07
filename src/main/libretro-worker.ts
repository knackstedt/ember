/**
 * Libretro worker child process.
 *
 * Loaded in a standalone Node.js process (no Electron / Chromium) to avoid
 * V8 signal-handler conflicts with dynarec cores.
 *
 * Communication with the parent is via Node.js built-in IPC (process.send/on('message')).
 */

import { join } from "path";
import { existsSync } from "fs";

const arch = process.arch === "arm64" ? "arm64" : "x64";
const addonName = `libretro-frontend.linux-${arch}-gnu.node`;

function findAddon(): string | null {
  const candidates = [
    join(__dirname, "..", "..", "resources", addonName),
    join(__dirname, "..", "renderer", addonName),
    join(__dirname, addonName),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

const addonPath = findAddon();
if (!addonPath) {
  console.error(JSON.stringify({ error: `Libretro native addon not found (${addonName})` }));
  process.exit(1);
}

const NativeAddon = require(addonPath);
const Frontend = new NativeAddon.LibretroFrontend();

process.on("message", (req: any) => {
  const { id, method, args } = req;
  if (!method) return;

  try {
    let result;
    switch (method) {
      case "loadCore":
        result = Frontend.loadCore(args[0]);
        break;
      case "loadGame":
        result = Frontend.loadGame(args[0], args[1]);
        break;
      case "start":
        result = Frontend.start(args[0]);
        break;
      case "stop":
        result = Frontend.stop(args[0]);
        break;
      case "reset":
        result = Frontend.reset(args[0]);
        break;
      case "unload":
        result = Frontend.unload(args[0]);
        break;
      case "unloadAll":
        result = Frontend.unloadAll();
        break;
      case "getFrame": {
        const frame = Frontend.getFrame(args[0]);
        if (frame && frame.data) {
          const src = new Uint8Array(frame.data);
          result = {
            width: frame.width,
            height: frame.height,
            data: Array.from(src),
          };
        } else {
          result = frame;
        }
        break;
      }
      case "getFrameBuffer": {
        const frame = Frontend.getFrameBuffer(args[0]);
        if (frame && frame.data) {
          const src = new Uint8Array(frame.data);
          result = {
            width: frame.width,
            height: frame.height,
            pitch: frame.pitch,
            format: frame.format,
            data: Array.from(src),
          };
        } else {
          result = frame;
        }
        break;
      }
      case "getAvInfo":
        result = Frontend.getAvInfo(args[0]);
        break;
      case "setInputState":
        result = Frontend.setInputState(args[0], args[1], args[2], args[3], args[4], args[5]);
        break;
      case "setAnalogState":
        result = Frontend.setAnalogState(args[0], args[1], args[2], args[3], args[4]);
        break;
      default:
        process.send!({ id, error: `Unknown method: ${method}` });
        return;
    }
    process.send!({ id, result });
  } catch (err: any) {
    process.send!({ id, error: err?.message ?? String(err) });
  }
});

process.on("disconnect", () => {
  Frontend.unloadAll();
  process.exit(0);
});

process.on("SIGTERM", () => {
  Frontend.unloadAll();
  process.exit(0);
});
