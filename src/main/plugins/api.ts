import { PluginManifest } from "../../shared/types";
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

export interface PluginModule {
  activate?: (api: PluginApi) => void;
  deactivate?: () => void;
  getComponent?: (slot: string) => unknown;
}

export interface PluginApi {
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
}

export const registeredPlugins: RegisteredPlugin[] = [];

export function createPluginApi(manifest: PluginManifest): PluginApi {
  return {
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
  };
}
