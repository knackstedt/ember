import { resolve } from "path";
// @ts-expect-error electron-vite is ESM-only; Node 20.19+ supports require(esm) at runtime
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  statSync,
  symlinkSync,
  unlinkSync,
} from "fs";

function getMimeType(fileName: string): string {
  const ext = fileName.split(".").pop() || "";
  const mime: Record<string, string> = {
    js: "application/javascript",
    mjs: "application/javascript",
    wasm: "application/wasm",
    map: "application/json",
    json: "application/json",
    css: "text/css",
    svg: "image/svg+xml",
    png: "image/png",
    ico: "image/x-icon",
    bin: "application/octet-stream",
  };
  return mime[ext] || "application/octet-stream";
}

function ruffleStaticPlugin(): any {
  const ruffleDir = resolve("node_modules/@ruffle-rs/ruffle");

  return {
    name: "ruffle-static",
    configureServer(server: any) {
      server.middlewares.use("/ruffle", (req: any, res: any, next: any) => {
        try {
          decodeURI(req.url ?? "");
        } catch {
          res.statusCode = 400;
          res.end("Bad Request");
          return;
        }
        const fileName = req.url?.replace(/^\/+/, "") ?? "";
        if (!fileName) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        const filePath = resolve(ruffleDir, fileName);
        if (!existsSync(filePath) || !statSync(filePath).isFile()) {
          next();
          return;
        }
        res.setHeader("Content-Type", getMimeType(fileName));
        res.end(readFileSync(filePath));
      });
    },
    writeBundle(options: any) {
      const outDir = options.dir;
      if (!outDir) return;
      const destDir = resolve(outDir, "ruffle");
      if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
      for (const file of readdirSync(ruffleDir)) {
        const src = resolve(ruffleDir, file);
        if (statSync(src).isFile()) {
          copyFileSync(src, resolve(destDir, file));
        }
      }
    },
  };
}

function copyDirRecursive(src: string, dest: string): void {
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = resolve(src, entry);
    const destPath = resolve(dest, entry);
    const stat = statSync(srcPath);
    if (stat.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else if (stat.isFile()) {
      copyFileSync(srcPath, destPath);
    }
  }
}

function libretroStaticPlugin(): any {
  const arches = ["x64", "arm64"];

  return {
    name: "libretro-static",
    configureServer(server: any) {
      server.middlewares.use("/libretro-frontend.node", (req: any, res: any, next: any) => {
        try {
          decodeURI(req.url ?? "");
        } catch {
          res.statusCode = 400;
          res.end("Bad Request");
          return;
        }
        const hostArch = process.arch === "arm64" ? "arm64" : "x64";
        const addonPath = resolve(`resources/libretro-frontend.linux-${hostArch}-gnu.node`);
        if (!existsSync(addonPath)) {
          res.statusCode = 404;
          res.end("Native addon not found. Run cargo build in native/libretro-frontend/");
          return;
        }
        res.setHeader("Content-Type", "application/octet-stream");
        res.end(readFileSync(addonPath));
      });
    },
    writeBundle(options: any) {
      const outDir = options.dir;
      if (!outDir) return;
      for (const arch of arches) {
        const addonPath = resolve(`resources/libretro-frontend.linux-${arch}-gnu.node`);
        if (existsSync(addonPath)) {
          copyFileSync(addonPath, resolve(outDir, `libretro-frontend.linux-${arch}-gnu.node`));
        }
      }
    },
  };
}

function videoDecoderStaticPlugin(): any {
  const arches = ["x64", "arm64"];

  return {
    name: "video-decoder-static",
    writeBundle(options: any) {
      const outDir = options.dir;
      if (!outDir) return;
      for (const arch of arches) {
        const addonPath = resolve(`resources/video-decoder.linux-${arch}-gnu.node`);
        if (!existsSync(addonPath)) continue;
        const outDest = resolve(outDir, `video-decoder.linux-${arch}-gnu.node`);
        if (existsSync(outDest)) {
          try {
            const link = readlinkSync(outDest);
            if (link === addonPath) continue;
          } catch {
            // Not a symlink; remove and recreate.
          }
          try { unlinkSync(outDest); } catch { /* ignore */ }
        }
        try {
          symlinkSync(addonPath, outDest);
        } catch {
          copyFileSync(addonPath, outDest);
        }
      }
    },
  };
}

function pluginStaticPlugin(): any {
  const pluginsDir = resolve(process.env.HOME || process.env.USERPROFILE || "", ".config/htpc/plugins");

  return {
    name: "plugin-static",
    configureServer(server: any) {
      server.middlewares.use("/plugin", (req: any, res: any, next: any) => {
        try {
          decodeURI(req.url ?? "");
        } catch {
          res.statusCode = 400;
          res.end("Bad Request");
          return;
        }
        const fileName = req.url?.replace(/^\/+/, "") ?? "";
        if (!fileName) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        const segments = fileName.split("/").filter(Boolean);
        const pluginId = segments[0];
        const assetPath = segments.slice(1).join("/");
        if (!pluginId || !assetPath) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        const filePath = resolve(pluginsDir, pluginId, "assets", assetPath);
        if (!existsSync(filePath) || !statSync(filePath).isFile()) {
          next();
          return;
        }
        res.setHeader("Content-Type", getMimeType(filePath));
        res.end(readFileSync(filePath));
      });
    },
    writeBundle() {
      // Plugin assets are served via ember://plugin/ protocol in production
    },
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), videoDecoderStaticPlugin()],
    build: {
      // @ts-expect-error electron-vite build.rollupOptions typing mismatch
      rollupOptions: {
        input: {
          index: resolve("src/main/index.ts"),
          "workers/game-scan.worker": resolve(
            "src/main/workers/game-scan.worker.ts",
          ),
          "workers/db.worker": resolve("src/main/workers/db.worker.ts"),
          "libretro-worker": resolve("src/main/libretro-worker.ts"),
          "mpv-worker": resolve("src/main/mpv-worker.ts"),
          "thumbnail-worker": resolve("src/main/thumbnail-worker.ts"),
        },
        output: {
          entryFileNames: "[name].js",
        },
      },
    },
    resolve: {
      alias: {
        "@main": resolve("src/main"),
        "@shared": resolve("src/shared"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      // @ts-expect-error electron-vite build.rollupOptions typing mismatch
      rollupOptions: {
        input: {
          index: resolve("src/preload/index.ts"),
          "streaming-preload": resolve("src/preload/streaming-preload.ts"),
        },
        output: {
          entryFileNames: "[name].js",
        },
      },
    },
    resolve: {
      alias: {
        "@shared": resolve("src/shared"),
      },
    },
  },
  renderer: {
    publicDir: resolve("public"),
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
        "@shared": resolve("src/shared"),
      },
    },
    plugins: [react(), ruffleStaticPlugin(), libretroStaticPlugin(), videoDecoderStaticPlugin(), pluginStaticPlugin()],
  },
});
