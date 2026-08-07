import { ipcMain, app } from "electron";
import { join } from "path";
import { readFileSync } from "fs";
import { listPlugins, reloadPlugins, callPluginHook } from "../../plugins/loader";
import { discoverPlugins, discoverAllReleases, discoverDevPlugins } from "../../services/plugin-discovery.service";
import {
  installPlugin,
  uninstallPlugin,
  updatePlugin,
  setPluginEnabled,
  listManagedPlugins,
} from "../../services/plugin-manager.service";
import { listThemes, getTheme } from "../../plugins/theme-registry";
import type { Game, DiscoveredPlugin, ThemeRegistration } from "../../../shared/types";
import type { IpcContext } from "../types";

export function registerPluginsHandlers(_ctx: IpcContext): void {
  const isDev = !app.isPackaged || process.env.NODE_ENV === "development";

  ipcMain.handle("plugins:list", async () => listPlugins());
  ipcMain.handle("plugins:reload", async () => reloadPlugins());
  ipcMain.handle("plugins:discover", async () => discoverPlugins());
  ipcMain.handle("plugins:discover-all", async () => {
    if (isDev) return discoverDevPlugins();
    return discoverAllReleases();
  });
  ipcMain.handle("plugins:managed-list", async () => listManagedPlugins());
  ipcMain.handle("plugins:install", async (_e, plugin: DiscoveredPlugin) => {
    await installPlugin(plugin);
    return true;
  });
  ipcMain.handle("plugins:uninstall", async (_e, id: string) => {
    await uninstallPlugin(id);
    return true;
  });
  ipcMain.handle("plugins:update", async (_e, plugin: DiscoveredPlugin) => {
    await updatePlugin(plugin);
    return true;
  });
  ipcMain.handle("plugins:set-enabled", async (_e, id: string, enabled: boolean) => {
    await setPluginEnabled(id, enabled);
    return true;
  });
  ipcMain.handle("plugins:launch-game", async (_e, game: Game) => {
    const result = await callPluginHook<{ type: string; url?: string; pluginId: string }>("onGameStart", game);
    return result ?? null;
  });

  ipcMain.handle("themes:list", async () => {
    const pluginThemes = listThemes();
    const builtIn: ThemeRegistration = {
      id: "ember",
      name: "Ember",
      pluginId: "builtin",
      cssUrl: "",
      preview: "linear-gradient(135deg,#121110,#d95f0a)",
    };
    return [builtIn, ...pluginThemes];
  });

  ipcMain.handle("themes:getCss", async (_e, themeId: string) => {
    const theme = getTheme(themeId);
    if (!theme) return null;
    try {
      const path = theme.cssUrl.replace(/^ember:\/\/plugin\//, "").replace(/^\/plugin\//, "");
      const segments = path.split("/");
      const pluginId = segments[0];
      const assetPath = segments.slice(1).join("/");
      const pluginDir = join(
        app.getPath("home") || process.cwd(),
        ".config",
        "htpc",
        "plugins",
        pluginId,
      );
      const filePath = join(pluginDir, "assets", assetPath);
      if (filePath.includes("..")) return null;
      return readFileSync(filePath, "utf-8");
    } catch {
      return null;
    }
  });
}
