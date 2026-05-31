import type { PluginApi } from "../../src/main/plugins/api";

export function activate(api: PluginApi): void {
  api.log("Example plugin activated!");

  api.addChipFilter("gaming", {
    id: "example-filter",
    label: "Example",
    predicate: (item) => true,
  });

  api.onIpc("ping", () => {
    return { pong: true, timestamp: Date.now() };
  });
}

export function deactivate(): void {
  console.log("[example-plugin] Deactivated");
}
