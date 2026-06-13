/**
 * v86 Plugin for Ember HTPC
 *
 * This plugin provides x86 PC emulation for DOS and legacy PC software
 * via the v86 emulator.
 */

module.exports = {
  async onPluginInstall(api) {
    api.log("v86 plugin installed");
    // The build process should bundle v86 build files and SeaBIOS
    // into the plugin's assets/ directory.
  },

  async onPluginStart(api) {
    api.log("v86 plugin started");
  },

  async onGameStart(api, game) {
    if (game.platform !== "dos") return null;

    const romParam = encodeURIComponent(game.romPath || "");
    const url = `${api.getAssetUrl("player.html")}?rom=${romParam}`;

    return {
      type: "iframe",
      url,
      pluginId: api.manifest.id,
    };
  },
};
