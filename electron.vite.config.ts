import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
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

function ruffleStaticPlugin(): Plugin {
  const ruffleDir = resolve("node_modules/@ruffle-rs/ruffle");

  return {
    name: "ruffle-static",
    configureServer(server) {
      server.middlewares.use("/ruffle", (req, res, next) => {
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
    writeBundle(options) {
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

// Core packages needed for supported platforms
const CORE_PACKAGES: Record<string, string> = {
  nestopia: "@emulatorjs/core-nestopia",
  snes9x: "@emulatorjs/core-snes9x",
  gambatte: "@emulatorjs/core-gambatte",
  mgba: "@emulatorjs/core-mgba",
};

function findCoreFile(fileName: string): string | null {
  for (const pkgName of Object.values(CORE_PACKAGES)) {
    const filePath = resolve("node_modules", pkgName, fileName);
    if (existsSync(filePath) && statSync(filePath).isFile()) {
      return filePath;
    }
  }
  return null;
}

function emulatorjsStaticPlugin(): Plugin {
  const ejsNpmDir = resolve("node_modules/@emulatorjs/emulatorjs/data");

  return {
    name: "emulatorjs-static",
    configureServer(server) {
      server.middlewares.use("/emulatorjs", (req, res, next) => {
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
        // Serve files directly from the @emulatorjs/emulatorjs data directory
        let filePath = resolve(ejsNpmDir, fileName);
        if (!existsSync(filePath) || !statSync(filePath).isFile()) {
          // Fall back to core packages for cores/*.data files
          if (fileName.startsWith("cores/")) {
            const corePath = findCoreFile(fileName.slice(6));
            if (corePath) filePath = corePath;
          }
        }
        if (!existsSync(filePath) || !statSync(filePath).isFile()) {
          next();
          return;
        }
        res.setHeader("Content-Type", getMimeType(filePath));
        res.end(readFileSync(filePath));
      });
    },
    writeBundle(options) {
      const outDir = options.dir;
      if (!outDir) return;
      const destDir = resolve(outDir, "emulatorjs");
      // Copy npm package data (includes src/, localization/, etc.)
      copyDirRecursive(ejsNpmDir, destDir);
      // Copy core .data files from the specific core packages we need
      const coresDestDir = resolve(destDir, "cores");
      if (!existsSync(coresDestDir)) mkdirSync(coresDestDir, { recursive: true });
      for (const pkgName of Object.values(CORE_PACKAGES)) {
        const pkgDir = resolve("node_modules", pkgName);
        if (!existsSync(pkgDir)) continue;
        for (const file of readdirSync(pkgDir)) {
          if (file.endsWith(".data")) {
            copyFileSync(resolve(pkgDir, file), resolve(coresDestDir, file));
          }
        }
      }
    },
  };
}

function libretroStaticPlugin(): Plugin {
  const arches = ["x64", "arm64"];

  return {
    name: "libretro-static",
    configureServer(server) {
      server.middlewares.use("/libretro-frontend.node", (req, res, next) => {
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
    writeBundle(options) {
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

function v86StaticPlugin(): Plugin {
  const v86BuildDir = resolve("node_modules/v86/build");
  const v86BiosDir = resolve("resources/v86-bios");

  return {
    name: "v86-static",
    configureServer(server) {
      server.middlewares.use("/v86", (req, res, next) => {
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
        let filePath: string;
        if (fileName.startsWith("build/")) {
          filePath = resolve(v86BuildDir, fileName.slice(6));
        } else if (fileName.startsWith("bios/")) {
          filePath = resolve(v86BiosDir, fileName.slice(5));
        } else {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        if (!existsSync(filePath) || !statSync(filePath).isFile()) {
          next();
          return;
        }
        res.setHeader("Content-Type", getMimeType(filePath));
        res.end(readFileSync(filePath));
      });
    },
    writeBundle(options) {
      const outDir = options.dir;
      if (!outDir) return;
      copyDirRecursive(v86BuildDir, resolve(outDir, "v86", "build"));
      copyDirRecursive(v86BiosDir, resolve(outDir, "v86", "bios"));
    },
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      // @ts-expect-error electron-vite build.rollupOptions typing mismatch
      rollupOptions: {
        input: {
          index: resolve("src/main/index.ts"),
          "workers/game-scan.worker": resolve(
            "src/main/workers/game-scan.worker.ts",
          ),
          "libretro-worker": resolve("src/main/libretro-worker.ts"),
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
    plugins: [react(), ruffleStaticPlugin(), emulatorjsStaticPlugin(), v86StaticPlugin(), libretroStaticPlugin()],
  },
});
