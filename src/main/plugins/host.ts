/**
 * PluginHost — main-process side of the per-plugin worker thread.
 *
 * Each plugin runs inside plugin.worker.ts (a worker_threads isolate). This
 * class owns the message bridge: hook invocations go main→worker, api bridge
 * calls (registerTheme, onIpc, config writes, logging) come back worker→main.
 *
 * A crashed/hung plugin cannot take down the main process — hook calls
 * reject, the plugin is marked errored, and the worker is terminated.
 */

import { ipcMain } from "electron";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { Worker } from "worker_threads";
import type { PluginManifest, ThemeRegistration } from "../../shared/types";
import { createLogger } from "../util/logger";
import type { PluginModule } from "./api";
import { registerTheme as doRegisterTheme } from "./theme-registry";

const log = createLogger("info");

const HOOK_TIMEOUT_MS = 30_000;

interface PendingCall {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class PluginHost {
  private worker: Worker;
  private reqId = 0;
  private pending = new Map<number, PendingCall>();
  private ipcChannels = new Set<string>();
  private manifest: PluginManifest;
  private pluginDir: string;
  private readyPromise: Promise<string[]>;
  private dead = false;

  constructor(manifest: PluginManifest, pluginDir: string, code: string) {
    this.manifest = manifest;
    this.pluginDir = pluginDir;

    const baseDir = join(__dirname, "workers", "plugin.worker.js");
    const chunkDir = join(__dirname, "..", "workers", "plugin.worker.js");
    const workerPath = existsSync(baseDir) ? baseDir : chunkDir;

    this.worker = new Worker(workerPath);
    this.worker.on("message", (msg) => this.onMessage(msg));
    this.worker.on("error", (err) => this.fail(err));
    this.worker.on("exit", (code) => {
      if (code !== 0 && !this.dead) {
        this.fail(new Error(`Plugin worker '${manifest.id}' exited with code ${code}`));
      }
    });

    this.readyPromise = new Promise<string[]>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
      this.worker.postMessage({
        type: "init",
        manifest,
        pluginDir,
        code,
        config: this.readConfig(),
        isDev: process.env.NODE_ENV === "development",
      });
    });
  }

  private readyResolve: (exports: string[]) => void = () => {};
  private readyReject: (err: Error) => void = () => {};

  /** Resolves with the plugin module's exported function names. */
  init(): Promise<string[]> {
    return this.readyPromise;
  }

  get pluginId(): string {
    return this.manifest.id;
  }

  async callHook<T = unknown>(hook: string, ...args: unknown[]): Promise<T | undefined> {
    const result = await this.request<T>("hook", { hook, args });
    return result === null ? undefined : result;
  }

  async invokeIpc<T = unknown>(channel: string, args: unknown[]): Promise<T> {
    return this.request<T>("ipc-invoke", { channel, args });
  }

  /** Build a PluginModule proxy exposing only the hooks the bundle exported. */
  createModuleProxy(exportNames: string[]): PluginModule {
    const mod: Record<string, unknown> = {};
    for (const name of exportNames) {
      mod[name] = (...args: unknown[]) => this.callHook(name, ...args);
    }
    return mod as PluginModule;
  }

  async terminate(): Promise<void> {
    if (this.dead) return;
    this.dead = true;
    for (const channel of this.ipcChannels) {
      try {
        ipcMain.removeHandler(`plugin:${this.manifest.id}:${channel}`);
      } catch { /* ignore */ }
    }
    this.ipcChannels.clear();
    try {
      this.worker.postMessage({ type: "shutdown" });
    } catch { /* already dead */ }
    const exit = new Promise<void>((r) => this.worker.once("exit", () => r()));
    await Promise.race([exit, new Promise<void>((r) => setTimeout(r, 2000))]);
    try {
      await this.worker.terminate();
    } catch { /* ignore */ }
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("Plugin worker terminated"));
    }
    this.pending.clear();
  }

  // -----------------------------------------------------------------------

  private request<T>(type: string, payload: Record<string, unknown>): Promise<T> {
    if (this.dead) return Promise.reject(new Error(`Plugin '${this.manifest.id}' worker is dead`));
    const id = ++this.reqId;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Plugin '${this.manifest.id}' ${type} '${payload.hook ?? payload.channel}' timed out`));
      }, HOOK_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });
      try {
        this.worker.postMessage({ type, id, ...payload });
      } catch (err) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  private fail(err: Error): void {
    this.dead = true;
    this.readyReject(err);
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  private onMessage(msg: {
    type: string;
    id?: number;
    exports?: string[];
    result?: unknown;
    error?: string;
    call?: string;
    args?: unknown[];
  }): void {
    switch (msg.type) {
      case "ready":
        this.readyResolve(msg.exports ?? []);
        break;
      case "init-error":
        this.readyReject(new Error(msg.error ?? "Plugin init failed"));
        break;
      case "hook-result":
      case "ipc-result": {
        const p = this.pending.get(msg.id!);
        if (!p) return;
        this.pending.delete(msg.id!);
        clearTimeout(p.timer);
        if (msg.error) p.reject(new Error(msg.error));
        else p.resolve(msg.result);
        break;
      }
      case "api":
        this.handleApiCall(msg.call!, msg.args ?? []);
        break;
    }
  }

  // -----------------------------------------------------------------------
  // api bridge (worker → main)
  // -----------------------------------------------------------------------

  private handleApiCall(call: string, args: unknown[]): void {
    const id = this.manifest.id;
    try {
      switch (call) {
        case "log":
          log.info(`plugin:${id}`, String(args[0] ?? ""));
          break;
        case "console": {
          const level = (args[0] as string) || "log";
          const text = (args[1] as string[] | undefined)?.join(" ") ?? "";
          const fn = level === "error" ? log.error : level === "warn" ? log.warn : log.info;
          fn(`plugin:${id}`, text);
          break;
        }
        case "registerTheme":
          doRegisterTheme({ ...(args[0] as ThemeRegistration), pluginId: id });
          log.info(`plugin:${id}`, `Register theme: ${(args[0] as ThemeRegistration)?.id}`);
          break;
        case "registerTab":
          log.info(`plugin:${id}`, `Register tab: ${args[0]} (${args[1]})`);
          break;
        case "registerSettingsPanel":
          log.info(`plugin:${id}`, `Register settings panel: ${args[0]}`);
          break;
        case "registerScanner":
          log.info(`plugin:${id}`, `Register scanner: ${args[0]}`);
          break;
        case "addChipFilter":
          log.info(`plugin:${id}`, `Add chip filter on tab "${args[0]}": ${(args[1] as { id?: string })?.id}`);
          break;
        case "onIpc":
          this.registerIpcChannel(args[0] as string);
          break;
        case "config:set":
          this.writeConfigKey(args[0] as string, args[1]);
          break;
      }
    } catch (err) {
      log.error(`plugin:${id}`, `api call ${call} failed: ${err}`);
    }
  }

  private registerIpcChannel(channel: string): void {
    if (this.ipcChannels.has(channel)) return;
    this.ipcChannels.add(channel);
    ipcMain.handle(`plugin:${this.manifest.id}:${channel}`, (_e, ...args: unknown[]) =>
      this.invokeIpc(channel, args),
    );
  }

  private readConfig(): Record<string, unknown> {
    try {
      const configPath = join(this.pluginDir, "config.json");
      if (existsSync(configPath)) {
        return JSON.parse(readFileSync(configPath, "utf-8"));
      }
    } catch { /* ignore */ }
    return {};
  }

  private writeConfigKey(key: string, value: unknown): void {
    try {
      const configPath = join(this.pluginDir, "config.json");
      let data: Record<string, unknown> = {};
      if (existsSync(configPath)) {
        data = JSON.parse(readFileSync(configPath, "utf-8"));
      }
      data[key] = value;
      writeFileSync(configPath, JSON.stringify(data, null, 2));
    } catch (err) {
      log.warn(`plugin:${this.manifest.id}`, `config write failed: ${err}`);
    }
  }
}
