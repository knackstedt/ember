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
        const ext = fileName.split(".").pop();
        const mime: Record<string, string> = {
          js: "application/javascript",
          wasm: "application/wasm",
          map: "application/json",
        };
        res.setHeader(
          "Content-Type",
          mime[ext || ""] || "application/octet-stream",
        );
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

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/main/index.ts"),
          "workers/game-scan.worker": resolve(
            "src/main/workers/game-scan.worker.ts",
          ),
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
    plugins: [react(), ruffleStaticPlugin()],
  },
});
