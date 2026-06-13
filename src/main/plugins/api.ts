import { PluginManifest, Game } from "../../shared/types";
import { createLogger } from "../util/logger";

const log = createLogger("info");

export type PluginSlotId =
  | "gaming.grid.before"
  | "gaming.grid.after"
  | "gaming.tabs.extra"
  | "movies.grid.before"
  | "movies.grid.after"
  | "music.grid.before"
  | "music.grid.after"
  | "tv.grid.before"
  | "tv.grid.after"
  | "settings.panels.extra"
  | "sidebar.extra"
  | "detail.actions.extra";

export interface RegisteredPlugin {
  manifest: PluginManifest;
  module: PluginModule;
  enabled: boolean;
  error?: string;
}

export interface PluginLaunchResult {
  type: "iframe" | "component" | "external";
  url?: string;
  pluginId: string;
}

export interface PluginModule {
  activate?: (api: PluginApi) => void;
  deactivate?: () => void;
  getComponent?: (slot: string) => unknown;

  // Lifecycle hooks
  onPluginInstall?: (api: PluginApi) => Promise<void> | void;
  onPluginUninstall?: () => Promise<void> | void;
  onPluginStart?: (api: PluginApi) => Promise<void> | void;
  onPluginStop?: () => Promise<void> | void;
  onPluginUpdate?: (oldVersion: string) => Promise<void> | void;
  onApplicationBoot?: (api: PluginApi) => Promise<void> | void;
  onApplicationShutdown?: () => Promise<void> | void;

  // Game hooks
  onGameStart?: (api: PluginApi, game: Game) => Promise<PluginLaunchResult | null | undefined> | PluginLaunchResult | null | undefined;
  onGameStop?: (api: PluginApi, game: Game) => Promise<void> | void;
  onGameCrash?: (api: PluginApi, game: Game, error: Error) => Promise<void> | void;
}

export interface PluginApi {
  manifest: PluginManifest;
  registerTab(id: string, label: string, component: unknown): void;
  registerSettingsPanel(id: string, label: string, component: unknown): void;
  registerScanner(id: string, fn: () => Promise<unknown[]>): void;
  addChipFilter(
    tab: string,
    filter: {
      id: string;
      label: string;
      predicate: (item: unknown) => boolean;
    },
  ): void;
  onIpc(channel: string, handler: (...args: unknown[]) => unknown): void;
  log(message: string): void;
  getAssetUrl(path: string): string;
  getAssetPath(path: string): string;
  config: {
    get<T = unknown>(key: string, defaultValue?: T): T | undefined;
    set<T = unknown>(key: string, value: T): void;
  };
}

export const registeredPlugins: RegisteredPlugin[] = [];

export function createPluginApi(manifest: PluginManifest): PluginApi {
  const pluginDir = require("path").join(
    (global as any).__PLUGINS_DIR__ ?? "",
    manifest.id,
  );

  return {
    manifest,
    registerTab(id, label, component) {
      log.info(`plugin:${manifest.id}`, `Register tab: ${id} (${label})`);
    },
    registerSettingsPanel(id, label, component) {
      log.info(`plugin:${manifest.id}`, `Register settings panel: ${id}`);
    },
    registerScanner(id, fn) {
      log.info(`plugin:${manifest.id}`, `Register scanner: ${id}`);
    },
    addChipFilter(tab, filter) {
      log.info(
        `plugin:${manifest.id}`,
        `Add chip filter on tab "${tab}": ${filter.id}`,
      );
    },
    onIpc(channel, handler) {
      const { ipcMain } = require("electron");
      ipcMain.handle(
        `plugin:${manifest.id}:${channel}`,
        (_e: unknown, ...args: unknown[]) => handler(...args),
      );
    },
    log(message) {
      log.info(`plugin:${manifest.id}`, message);
    },
    getAssetUrl(path) {
      const cleanPath = path.replace(/^\//, "");
      if (process.env.NODE_ENV === "development") {
        return `/plugin/${manifest.id}/${cleanPath}`;
      }
      return `ember://plugin/${manifest.id}/${cleanPath}`;
    },
    getAssetPath(path) {
      const cleanPath = path.replace(/^\//, "");
      return require("path").join(pluginDir, manifest.assetsPath || "assets", cleanPath);
    },
    config: {
      get(key, defaultValue) {
        try {
          const configPath = require("path").join(pluginDir, "config.json");
          if (!require("fs").existsSync(configPath)) return defaultValue;
          const data = JSON.parse(require("fs").readFileSync(configPath, "utf-8"));
          return data[key] ?? defaultValue;
        } catch {
          return defaultValue;
        }
      },
      set(key, value) {
        try {
          const configPath = require("path").join(pluginDir, "config.json");
          let data: Record<string, unknown> = {};
          if (require("fs").existsSync(configPath)) {
            data = JSON.parse(require("fs").readFileSync(configPath, "utf-8"));
          }
          data[key] = value;
          require("fs").writeFileSync(configPath, JSON.stringify(data, null, 2));
        } catch {
          /* ignore */
        }
      },
    },
  };
}
