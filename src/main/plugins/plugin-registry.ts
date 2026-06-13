import { RegisteredPlugin } from "./api";

const installedPlugins = new Map<string, RegisteredPlugin>();
const activePlugins = new Map<string, RegisteredPlugin>();

export function registerInstalledPlugin(plugin: RegisteredPlugin): void {
  installedPlugins.set(plugin.manifest.id, plugin);
}

export function unregisterInstalledPlugin(id: string): void {
  installedPlugins.delete(id);
  activePlugins.delete(id);
}

export function getInstalledPlugin(id: string): RegisteredPlugin | undefined {
  return installedPlugins.get(id);
}

export function getInstalledPluginIds(): Map<string, RegisteredPlugin> {
  return new Map(installedPlugins);
}

export function setPluginActive(id: string, plugin: RegisteredPlugin): void {
  activePlugins.set(id, plugin);
}

export function setPluginInactive(id: string): void {
  activePlugins.delete(id);
}

export function getActivePlugin(id: string): RegisteredPlugin | undefined {
  return activePlugins.get(id);
}

export function getActivePlugins(): RegisteredPlugin[] {
  return Array.from(activePlugins.values());
}

export function clearRegistry(): void {
  installedPlugins.clear();
  activePlugins.clear();
}
